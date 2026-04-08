"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

interface Appointment {
  businessId: string;
  name: string;
  meetingAt: Date;
}

interface AppointmentsWeekViewProps {
  appointments: Appointment[];
}

const DAY_NAMES = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const MONTH_NAMES = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December",
];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getWeekDays(referenceDate: Date): Date[] {
  const dayOfWeek = referenceDate.getDay();
  const monday = new Date(referenceDate);
  monday.setDate(referenceDate.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getMonthDays(year: number, month: number): Date[] {
  // Get first day of month
  const firstDay = new Date(year, month, 1);
  // Start grid from Monday of that week
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(1 - startOffset);

  // Always show 6 weeks (42 days) for consistent grid height
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

type ViewMode = "week" | "month";

export function AppointmentsWeekView({ appointments }: AppointmentsWeekViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const today = useMemo(() => new Date(), []);

  const weekDays = useMemo(() => getWeekDays(referenceDate), [referenceDate]);
  const monthDays = useMemo(
    () => getMonthDays(referenceDate.getFullYear(), referenceDate.getMonth()),
    [referenceDate]
  );

  const navigatePrev = () => {
    setReferenceDate((prev) => {
      const d = new Date(prev);
      if (viewMode === "week") {
        d.setDate(d.getDate() - 7);
      } else {
        d.setMonth(d.getMonth() - 1);
      }
      return d;
    });
  };

  const navigateNext = () => {
    setReferenceDate((prev) => {
      const d = new Date(prev);
      if (viewMode === "week") {
        d.setDate(d.getDate() + 7);
      } else {
        d.setMonth(d.getMonth() + 1);
      }
      return d;
    });
  };

  const goToToday = () => setReferenceDate(new Date());

  // Build appointment lookup
  const getAppointmentsForDay = (day: Date) =>
    appointments.filter((apt) => isSameDay(new Date(apt.meetingAt), day));

  // Header label
  const headerLabel =
    viewMode === "week"
      ? `${weekDays[0].getDate()} ${MONTH_NAMES[weekDays[0].getMonth()].slice(0, 3)} — ${weekDays[6].getDate()} ${MONTH_NAMES[weekDays[6].getMonth()].slice(0, 3)} ${weekDays[6].getFullYear()}`
      : `${MONTH_NAMES[referenceDate.getMonth()]} ${referenceDate.getFullYear()}`;

  return (
    <div className="mb-4 rounded-xl border border-card-border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">
            {headerLabel}
          </h4>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goToToday}
            className="rounded-md border border-card-border px-2 py-1 text-[10px] font-medium text-muted hover:bg-gray-50 transition-colors"
          >
            Vandaag
          </button>
          <button
            onClick={navigatePrev}
            className="rounded-md border border-card-border p-1 text-muted hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={navigateNext}
            className="rounded-md border border-card-border p-1 text-muted hover:bg-gray-50 transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode(viewMode === "week" ? "month" : "week")}
            className="ml-1 rounded-md border border-card-border p-1 text-muted hover:bg-gray-50 transition-colors"
            title={viewMode === "week" ? "Maandweergave" : "Weekweergave"}
          >
            <Calendar className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Week view */}
      {viewMode === "week" && (
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day, i) => {
            const dayAppointments = getAppointmentsForDay(day);
            const isToday = isSameDay(day, today);
            const isWeekend = i >= 5;

            return (
              <div
                key={i}
                className={`rounded-lg border p-2 min-h-[80px] ${
                  isToday
                    ? "border-accent/40 bg-accent/5"
                    : isWeekend
                    ? "border-card-border bg-gray-50/50"
                    : "border-card-border bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`text-xs font-semibold ${
                      isToday ? "text-accent" : isWeekend ? "text-muted/50" : "text-muted"
                    }`}
                  >
                    {DAY_NAMES[i]}
                  </span>
                  <span
                    className={`text-xs ${
                      isToday ? "text-accent font-bold" : "text-muted"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </div>
                <div className="space-y-1">
                  {dayAppointments.length === 0 ? (
                    <p className="text-[10px] text-muted/50 italic">Geen</p>
                  ) : (
                    dayAppointments.map((apt) => (
                      <Link
                        key={apt.businessId}
                        href={`/leads/${apt.businessId}`}
                        className="block rounded bg-indigo-50 border border-indigo-100 px-1.5 py-1 hover:bg-indigo-100 transition-colors"
                      >
                        <p className="text-[10px] font-medium text-indigo-800 truncate">
                          {apt.name}
                        </p>
                        <p className="text-[9px] text-indigo-600">
                          {new Date(apt.meetingAt).toLocaleTimeString("nl-BE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Month view */}
      {viewMode === "month" && (
        <div>
          {/* Day name headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_NAMES.map((name) => (
              <div key={name} className="text-center text-[10px] font-semibold text-muted uppercase py-1">
                {name}
              </div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day, i) => {
              const dayAppointments = getAppointmentsForDay(day);
              const isToday = isSameDay(day, today);
              const isCurrentMonth = day.getMonth() === referenceDate.getMonth();
              const isWeekend = i % 7 >= 5;

              return (
                <div
                  key={i}
                  className={`rounded-md border p-1 min-h-[56px] ${
                    isToday
                      ? "border-accent/40 bg-accent/5"
                      : !isCurrentMonth
                      ? "border-transparent bg-gray-50/30"
                      : isWeekend
                      ? "border-card-border/50 bg-gray-50/50"
                      : "border-card-border/50 bg-white"
                  }`}
                >
                  <span
                    className={`text-[10px] block mb-0.5 ${
                      isToday
                        ? "text-accent font-bold"
                        : !isCurrentMonth
                        ? "text-muted/30"
                        : "text-muted"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  <div className="space-y-0.5">
                    {dayAppointments.slice(0, 2).map((apt) => (
                      <Link
                        key={apt.businessId}
                        href={`/leads/${apt.businessId}`}
                        className="block rounded bg-indigo-50 border border-indigo-100 px-1 py-0.5 hover:bg-indigo-100 transition-colors"
                      >
                        <p className="text-[8px] font-medium text-indigo-800 truncate">
                          {apt.name}
                        </p>
                      </Link>
                    ))}
                    {dayAppointments.length > 2 && (
                      <p className="text-[8px] text-muted">+{dayAppointments.length - 2}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
