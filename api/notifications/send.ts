import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") return res.status(405).end();

    const { oneSignalId, title, body, url, include_subscription_ids } =
        req.body;

    const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
    const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
    console.log({ ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY });

    if (!ONESIGNAL_REST_API_KEY) {
        return res
            .status(500)
            .json({ error: "OneSignal REST API Key not configured" });
    }

    try {
        const response = await fetch(
            "https://onesignal.com/api/v1/notifications",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
                },
                body: JSON.stringify({
                    app_id: ONESIGNAL_APP_ID,
                    include_subscription_ids:
                        include_subscription_ids ||
                        (oneSignalId ? [oneSignalId] : undefined),
                    headings: { en: title, vi: title },
                    contents: { en: body, vi: body },
                    url: url || "/",
                    web_push_topic: "order-update",
                }),
            },
        );

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ error: "Failed to send notification" });
    }
}
