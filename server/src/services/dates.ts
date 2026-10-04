// Calendar dates in the application's local timezone, independent of the server's timezone.
export const todayDate = (now = new Date()) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);
