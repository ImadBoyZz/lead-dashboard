export const dynamic = 'force-dynamic';

import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { ReminderList } from "@/components/reminders/reminder-list";

export default function RemindersPage() {
  return (
    <div>
      <Header
        title="Reminders"
        description="Openstaande follow-ups en taken"
      />
      <Card>
        <ReminderList />
      </Card>
    </div>
  );
}
