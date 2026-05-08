import { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { formatInTimeZone, toDate } from 'date-fns-tz';
import { addDays, subMinutes, setHours, setMinutes, startOfDay } from 'date-fns';

const ICT_TIMEZONE = 'Asia/Ho_Chi_Minh';

// Helper to initialize Firebase Admin
function initAdmin() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}') as ServiceAccount;
    initializeApp({
      credential: cert(serviceAccount)
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Authenticate request
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    initAdmin();
    const db = getFirestore();

    // 2. Read config/main
    const configDoc = await db.collection('config').doc('main').get();
    if (!configDoc.exists) {
      return res.status(404).json({ error: 'Config document not found' });
    }

    const config = configDoc.data();
    const closeTime = config?.closeTime || '17:00'; // HH:mm
    const servingDays = config?.servingDays || []; // ['mon', 'tue', ...]

    // 3. Check if tomorrow is a serving day
    // Current time in ICT
    const nowICT = toDate(new Date(), { timeZone: ICT_TIMEZONE });
    const tomorrowICT = addDays(nowICT, 1);
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const tomorrowDayName = dayNames[tomorrowICT.getDay()];

    if (!servingDays.includes(tomorrowDayName)) {
      return res.status(200).json({ 
        message: `Tomorrow (${tomorrowDayName}) is not a serving day. No notification scheduled.`,
        servingDays 
      });
    }

    // 4. Calculate send_after time (closeTime - 30 minutes)
    const [hours, minutes] = closeTime.split(':').map(Number);
    let sendAtICT = startOfDay(nowICT);
    sendAtICT = setHours(sendAtICT, hours);
    sendAtICT = setMinutes(sendAtICT, minutes);
    sendAtICT = subMinutes(sendAtICT, 30);

    // If for some reason the calculated time is in the past, don't schedule
    if (sendAtICT < nowICT) {
       return res.status(200).json({ 
         message: 'Calculated notification time is in the past. Skipping.',
         now: nowICT.toISOString(),
         scheduled: sendAtICT.toISOString()
       });
    }

    // Convert to ISO string in UTC
    const sendAfterUTC = sendAtICT.toISOString();

    // 5. Query users with role == "kid" and collect oneSignalIds
    const usersSnapshot = await db.collection('users').where('role', '==', 'kid').get();
    const allOneSignalIds: string[] = [];
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (Array.isArray(data.oneSignalIds)) {
        allOneSignalIds.push(...data.oneSignalIds);
      }
    });

    const uniqueIds = [...new Set(allOneSignalIds)].filter(Boolean);

    if (uniqueIds.length === 0) {
      return res.status(200).json({ message: 'No kid users with OneSignal IDs found.' });
    }

    // 6. Call OneSignal REST API
    const oneSignalAppId = process.env.VITE_ONESIGNAL_APP_ID;
    const oneSignalRestKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!oneSignalAppId || !oneSignalRestKey) {
      throw new Error('OneSignal environment variables missing');
    }

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${oneSignalRestKey}`
      },
      body: JSON.stringify({
        app_id: oneSignalAppId,
        include_subscription_ids: uniqueIds,
        headings: { 
          en: "🍱 Sắp hết giờ đặt món", 
          vi: "🍱 Sắp hết giờ đặt món" 
        },
        contents: { 
          en: `Kitchen closes at ${closeTime}, please finish your orders before then!`, 
          vi: `Bếp đóng cửa lúc ${closeTime}, bé hãy hoàn tất đặt món trước nhé!` 
        },
        send_after: sendAfterUTC,
        url: "/",
        web_push_topic: "kitchen-closing"
      })
    });

    const oneSignalResult = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: 'OneSignal API error', 
        detail: oneSignalResult 
      });
    }

    // 7. Success response
    return res.status(200).json({ 
      message: 'Notification scheduled successfully',
      notificationId: oneSignalResult.id,
      recipientCount: uniqueIds.length,
      sendAfterUTC,
      servingDay: tomorrowDayName
    });

  } catch (error) {
    console.error('Error in cron function:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      detail: error instanceof Error ? error.message : String(error) 
    });
  }
}
