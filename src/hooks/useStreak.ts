import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const useStreak = (userId: string | undefined) => {
  const [streak, setStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const calculateStreak = async () => {
      if (!userId) return;
      
      try {
        setLoading(true);
        // Fetch all orders for this kid, sorted by date desc
        const ordersRef = collection(db, 'orders');
        const q = query(
          ordersRef,
          where('kidId', '==', userId),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const orders = snapshot.docs.map(d => d.data());

        // Get unique order dates (YYYY-MM-DD format)
        // We use createdAt.toDate() if it's a Timestamp, or handle it if it's already a date string
        const orderDates = [...new Set(
          orders.map(o => {
            const date = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
            return date.toISOString().split('T')[0];
          })
        )];

        // Calculate current streak (consecutive school days going back from today)
        let current = 0;
        let longest = 0;
        let tempStreak = 0;
        const today = new Date();

        // Get all school days (Mon-Fri) going back 90 days (increased to be safe)
        const schoolDays: string[] = [];
        for (let i = 0; i < 90; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const day = d.getDay();
          if (day !== 0 && day !== 6) { // not Sat (6) or Sun (0)
            schoolDays.push(d.toISOString().split('T')[0]);
          }
        }

        // Count consecutive days with orders
        let currentStreakFound = false;
        
        // We need to iterate through school days to find gaps
        for (let i = 0; i < schoolDays.length; i++) {
          const dateStr = schoolDays[i];
          if (orderDates.includes(dateStr)) {
            tempStreak++;
            
            // Current streak logic:
            // If the streak includes today (i=0) or yesterday (i=1), it's current
            if (!currentStreakFound && (i === 0 || i === 1)) {
              // We keep incrementing as long as consecutive days are found
            }
          } else {
            // Gap found
            if (!currentStreakFound && tempStreak > 0) {
              // If we were tracking the current streak (started at i=0 or i=1), save it
              // But wait, the loop logic above is a bit flawed for "current" streak
              // Let's refine:
            }
            
            // Update longest
            longest = Math.max(longest, tempStreak);
            
            // Check if this gap broke the potential "current" streak
            if (i <= 1 && !currentStreakFound) {
              // If no order today AND no order yesterday, current streak is 0
              currentStreakFound = true;
              current = 0;
            } else if (!currentStreakFound) {
              current = tempStreak;
              currentStreakFound = true;
            }
            
            tempStreak = 0;
          }
        }
        
        // Final catch for streaks that don't end within the 90 days
        longest = Math.max(longest, tempStreak);
        if (!currentStreakFound) current = tempStreak;

        setStreak(current);
        setLongestStreak(longest);
      } catch (err) {
        console.error('Error calculating streak:', err);
      } finally {
        setLoading(false);
      }
    };

    calculateStreak();
  }, [userId]);

  return { streak, longestStreak, loading };
};
