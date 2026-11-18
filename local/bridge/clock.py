"""Market clock without tz databases (Windows Python has no tzdata by default).
India has a fixed UTC+05:30 offset. US Eastern uses the statutory DST rule. Holidays: weekends + user-added dates only;
the engine additionally refuses to trade when the latest price is stale, which covers unlisted holidays."""
import datetime as dt

SESSIONS = {"IN": (9 * 60 + 15, 15 * 60 + 30, "Asia/Kolkata"), "US": (9 * 60 + 30, 16 * 60, "America/New_York")}
UTC = dt.timezone.utc


def _nth_sunday(year, month, n):
    d = dt.date(year, month, 1)
    d += dt.timedelta(days=(6 - d.weekday()) % 7)  # first Sunday
    return d + dt.timedelta(weeks=n - 1)


def us_offset_hours(ts):
    y = dt.datetime.fromtimestamp(ts, UTC).year
    start = dt.datetime.combine(_nth_sunday(y, 3, 2), dt.time(7, 0), UTC)  # 02:00 EST == 07:00 UTC
    end = dt.datetime.combine(_nth_sunday(y, 11, 1), dt.time(6, 0), UTC)   # 02:00 EDT == 06:00 UTC
    t = dt.datetime.fromtimestamp(ts, UTC)
    return -4 if start <= t < end else -5


def local_dt(market, ts):
    off = dt.timedelta(hours=5, minutes=30) if market == "IN" else dt.timedelta(hours=us_offset_hours(ts))
    return dt.datetime.fromtimestamp(ts, UTC).replace(tzinfo=None) + off


def market_state(market, ts, extra_holidays=()):
    o, c, tz = SESSIONS[market]
    d = local_dt(market, ts); mins = d.hour * 60 + d.minute; date = d.date().isoformat()
    base = {"market": market, "tz": tz, "date": date, "minutes": mins, "open_min": o, "close_min": c}
    if d.weekday() >= 5: return dict(base, open=False, reason="weekend")
    if date in set(extra_holidays): return dict(base, open=False, reason="holiday (added by you)")
    if mins < o: return dict(base, open=False, reason="before the open")
    if mins >= c: return dict(base, open=False, reason="after the close")
    return dict(base, open=True, reason="regular session")
