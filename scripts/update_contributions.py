"""Render the public GitHub contribution calendar using only the Python stdlib."""

import argparse
import calendar
from datetime import date, datetime, timedelta, timezone
from html import escape
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.request import Request, urlopen


class CalendarParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.days = {}
        self.labels = {}
        self.tooltip = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "td" and "ContributionCalendar-day" in attrs.get("class", "").split():
            self.days[attrs["id"]] = (date.fromisoformat(attrs["data-date"]), int(attrs["data-level"]))
        if tag == "tool-tip":
            self.tooltip = attrs.get("for")
            if self.tooltip:
                self.labels[self.tooltip] = ""

    def handle_data(self, data):
        if self.tooltip:
            self.labels[self.tooltip] += data

    def handle_endtag(self, tag):
        if tag == "tool-tip":
            self.tooltip = None


def parse_calendar(source):
    parser = CalendarParser()
    parser.feed(source)
    result = []
    for identifier, (day, level) in parser.days.items():
        label = parser.labels.get(identifier, "").strip()
        match = re.match(r"^(No|[\d,]+) contributions?\b", label)
        if not match or level not in range(5):
            raise ValueError(f"Unrecognized contribution data for {day}")
        count = 0 if match[1] == "No" else int(match[1].replace(",", ""))
        if (count == 0) != (level == 0):
            raise ValueError(f"Count/level mismatch for {day}")
        result.append((day, count, level))
    result.sort()
    if not 350 <= len(result) <= 371:
        raise ValueError("Incomplete calendar; keeping previous images")
    if any(b[0] - a[0] != timedelta(days=1) for a, b in zip(result, result[1:])):
        raise ValueError("Calendar has missing or duplicate dates")
    return result


def render(days, theme, updated):
    dark = theme == "dark"
    text, muted = ("#f4d4d7", "#c7adb6") if dark else ("#612b40", "#796871")
    colors = ["#24202a", "#583044", "#91435f", "#c76d87", "#f1a9b5"] if dark else [
        "#f2e9ed", "#efd0d8", "#d99bab", "#b8617c", "#84334f"]
    total = sum(day[1] for day in days)
    start = days[0][0] - timedelta(days=(days[0][0].weekday() + 1) % 7)
    out = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="290" viewBox="0 0 1200 290" role="img" aria-labelledby="title desc">',
        f'<title id="title">{total:,} contributions on the public GitHub profile</title>',
        f'<desc id="desc">Daily contributions from {days[0][0]} to {days[-1][0]}. Updated {updated} UTC.</desc>',
        '<g font-family="Segoe UI,Arial,sans-serif">',
        f'<text x="22" y="34" fill="{text}" font-size="23" font-weight="600">{total:,} contributions</text>',
        f'<text x="1178" y="34" fill="{muted}" font-size="16" text-anchor="end">{days[0][0]} — {days[-1][0]}</text>',
    ]
    for row, label in [(1, "Mon"), (3, "Wed"), (5, "Fri")]:
        out.append(f'<text x="22" y="{97 + row * 20}" fill="{muted}" font-size="13">{label}</text>')
    for day, count, level in days:
        week, weekday = (day - start).days // 7, (day.weekday() + 1) % 7
        x, y = 76 + week * 20, 82 + weekday * 20
        if day.day <= 7 and weekday == 0:
            out.append(f'<text x="{x}" y="68" fill="{muted}" font-size="14">{calendar.month_abbr[day.month]}</text>')
        out.append(
            f'<rect x="{x}" y="{y}" width="16" height="16" rx="3" fill="{colors[level]}">'
            f'<title>{day}: {count:,} contributions</title></rect>')
    out.append(f'<text x="22" y="263" fill="{muted}" font-size="15">Public profile activity · Updated {escape(updated)} UTC</text>')
    out.append(f'<text x="983" y="263" fill="{muted}" font-size="13">Less</text>')
    for i, color in enumerate(colors):
        out.append(f'<rect x="{1020 + i * 21}" y="250" width="16" height="16" rx="3" fill="{color}"/>')
    out.append(f'<text x="1134" y="263" fill="{muted}" font-size="13">More</text></g></svg>')
    return "\n".join(out) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, help="Optional saved public calendar HTML for local verification")
    args = parser.parse_args()
    if args.source:
        source = args.source.read_text(encoding="utf-8-sig")
    else:
        request = Request("https://github.com/users/Plastic-time/contributions", headers={
            "User-Agent": "Plastic-time-profile-calendar", "Accept-Language": "en-US"})
        with urlopen(request, timeout=30) as response:
            source = response.read().decode("utf-8")
    days = parse_calendar(source)
    today = datetime.now(timezone.utc).date()
    if not timedelta(0) <= today - days[-1][0] <= timedelta(days=2):
        raise ValueError("Calendar is stale or from the future; keeping previous images")
    assets = Path(__file__).resolve().parents[1] / "assets"
    for theme in ("light", "dark"):
        target = assets / f"contributions-{theme}.svg"
        temporary = target.with_suffix(".svg.tmp")
        temporary.write_text(render(days, theme, today.isoformat()), encoding="utf-8", newline="\n")
        temporary.replace(target)
    print(f"Rendered {len(days)} days, {sum(day[1] for day in days)} contributions; last day {days[-1][0]}")


if __name__ == "__main__":
    main()
