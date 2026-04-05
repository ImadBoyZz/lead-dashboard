"use client";

import { useState, useEffect } from "react";

export function ReminderBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch("/api/reminders?status=pending")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const now = new Date();
          const overdue = data.filter(
            (r: { reminder: { dueDate: string } }) => new Date(r.reminder.dueDate) < now
          );
          setCount(overdue.length);
        }
      })
      .catch(() => setCount(0));
  }, []);

  if (count === 0) return null;

  return (
    <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
      {count}
    </span>
  );
}
