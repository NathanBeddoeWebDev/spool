const sameYear = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const otherYear = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "Thu, 24 Sep, 09:00" in the reader's own locale and time zone. */
export function formatWhen(when: Date | string): string {
  const date = typeof when === 'string' ? new Date(when) : when;
  return (date.getFullYear() === new Date().getFullYear() ? sameYear : otherYear).format(date);
}

/** Value for <input type="datetime-local">, in local time. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
