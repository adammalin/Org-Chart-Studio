#!/usr/bin/env python3
"""Create the selectable-text OrgChart Studio macOS quick-start guide."""

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "ORNL-OrgChart-Studio-macOS-Quick-Start.pdf"
PAGE_W, PAGE_H = letter

ORNL_GREEN = HexColor("#00662C")
HALE_NAVY = HexColor("#00454D")
DARK_MATTER = HexColor("#373A36")
GRAPHITE = HexColor("#DBDCDB")
ENERGY = HexColor("#7DBA00")
SOFT_GREEN = HexColor("#E8F2EA")
SOFT_NAVY = HexColor("#E7F0F1")
WHITE = white


def draw_wrapped_text(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font: str,
    size: float,
    color=DARK_MATTER,
    leading: float | None = None,
) -> float:
    """Draw a simple word-wrapped paragraph and return the next baseline."""
    leading = leading or size * 1.35
    line = ""
    pdf.setFont(font, size)
    pdf.setFillColor(color)
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if line and stringWidth(candidate, font, size) > max_width:
            pdf.drawString(x, y, line)
            y -= leading
            line = word
        else:
            line = candidate
    if line:
        pdf.drawString(x, y, line)
        y -= leading
    return y


def draw_label(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    color=ORNL_GREEN,
) -> None:
    pdf.setFillColor(color)
    pdf.setFont("Helvetica-Bold", 8.5)
    pdf.drawString(x, y, text.upper())


def draw_code_block(
    pdf: canvas.Canvas,
    lines: list[str],
    x: float,
    top: float,
    width: float,
    height: float,
    font_size: float = 6.7,
) -> None:
    pdf.setFillColor(HALE_NAVY)
    pdf.rect(x, top - height, width, height, stroke=0, fill=1)
    pdf.setFillColor(ENERGY)
    pdf.rect(x, top - height, 5, height, stroke=0, fill=1)
    pdf.setFont("Courier", font_size)
    pdf.setFillColor(WHITE)
    baseline = top - 19
    for line in lines:
        pdf.drawString(x + 15, baseline, line)
        baseline -= 13.5


def draw_header_flow(pdf: canvas.Canvas) -> None:
    """Draw a small renderer-neutral product flow without unapproved artwork."""
    left = 380
    node_y = 683
    node_width = 57
    node_height = 38
    gap = 19

    pdf.setStrokeColor(WHITE)
    pdf.setLineWidth(1.2)
    for index, label in enumerate(["LOCAL", "CHART", "BACKUP"]):
        x = left + index * (node_width + gap)
        pdf.rect(x, node_y, node_width, node_height, stroke=1, fill=0)
        pdf.setFillColor(WHITE)
        pdf.setFont("Helvetica-Bold", 8.2)
        pdf.drawCentredString(x + node_width / 2, node_y + 22, label)
        pdf.setFont("Helvetica", 6.8)
        sublabel = ["DATA", "VIEW", "ENCRYPTED"][index]
        pdf.drawCentredString(x + node_width / 2, node_y + 10, sublabel)
        if index < 2:
            line_start = x + node_width
            line_end = x + node_width + gap
            line_y = node_y + node_height / 2
            pdf.line(line_start, line_y, line_end - 4, line_y)
            pdf.line(line_end - 8, line_y + 4, line_end - 4, line_y)
            pdf.line(line_end - 8, line_y - 4, line_end - 4, line_y)

    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 8.3)
    pdf.drawRightString(571, 661, "ONE LOCAL SOURCE OF TRUTH")


def build_pdf(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output), pagesize=letter, pageCompression=1)
    pdf.setTitle("ORNL OrgChart Studio macOS Quick Start")
    pdf.setAuthor("ORNL OrgChart Studio")
    pdf.setSubject(
        "Install, update, start, import, edit, and protect data in the macOS desktop source test"
    )

    pdf.setFillColor(WHITE)
    pdf.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    pdf.setFillColor(ORNL_GREEN)
    pdf.rect(0, PAGE_H - 166, PAGE_W, 166, stroke=0, fill=1)
    pdf.setFillColor(HALE_NAVY)
    pdf.rect(PAGE_W - 18, PAGE_H - 166, 18, 166, stroke=0, fill=1)
    pdf.setFillColor(ENERGY)
    pdf.rect(0, PAGE_H - 172, PAGE_W, 6, stroke=0, fill=1)

    draw_label(pdf, "ORNL workflow | macOS quick start | updated August 3, 2026", 40, 756, WHITE)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 28)
    pdf.drawString(40, 716, "Install once.")
    pdf.drawString(40, 684, "Launch anytime.")
    pdf.setFont("Helvetica", 11.5)
    pdf.drawString(40, 654, "OrgChart Studio runs locally after first-time setup.")
    draw_header_flow(pdf)

    draw_label(pdf, "01  First install or update", 40, 594)
    y = draw_wrapped_text(
        pdf,
        "After the GitHub repository is public, copy both commands below. The second command "
        "installs, builds, verifies, and launches OrgChart Studio.",
        40,
        575,
        532,
        "Helvetica",
        10,
        leading=13.5,
    )
    install_lines = [
        "/usr/bin/curl --fail --location --show-error \\",
        '  --output "$HOME/Downloads/orgchart-studio-install.zsh" \\',
        '  "https://raw.githubusercontent.com/adammalin/Organizational-Chart-Platform/main/scripts/bootstrap-mac-source-test.zsh"',
        "",
        '/bin/zsh "$HOME/Downloads/orgchart-studio-install.zsh" \\',
        '  "$HOME/OrgChart-Studio-source-test"',
    ]
    draw_code_block(pdf, install_lines, 40, y - 5, 532, 108)
    pdf.setFillColor(SOFT_GREEN)
    pdf.rect(40, y - 141, 532, 23, stroke=0, fill=1)
    pdf.setFillColor(ORNL_GREEN)
    pdf.setFont("Helvetica-Bold", 8.5)
    pdf.drawString(
        51,
        y - 133,
        "TO UPDATE LATER: quit OrgChart Studio, then run these same two commands again.",
    )

    draw_label(pdf, "02  Start OrgChart Studio after install", 40, 366)
    y2 = draw_wrapped_text(
        pdf,
        "For later sessions, open Terminal and run:",
        40,
        347,
        532,
        "Helvetica",
        10,
        leading=13,
    )
    launch_lines = [
        '/bin/zsh "$HOME/OrgChart-Studio-source-test/scripts/start-mac-source-test.zsh"',
    ]
    draw_code_block(pdf, launch_lines, 40, y2 - 4, 532, 46, font_size=7.4)

    draw_label(pdf, "03  First working session", 40, 251)
    draw_wrapped_text(
        pdf,
        "Create a blank chart, or use Sources & imports to validate a reviewed CSV, Excel, or JSON file. "
        "In Desktop file locations, keep the live library in a local folder and select a different backup "
        "folder. OneDrive or Dropbox is appropriate only for the encrypted backup package.",
        40,
        232,
        532,
        "Helvetica",
        9.1,
        leading=12.2,
    )

    cards = [
        (
            40,
            SOFT_GREEN,
            ORNL_GREEN,
            "LIVE DATA",
            "Choose local only",
            "Keep the working database outside Git, OneDrive, Dropbox, and iCloud.",
        ),
        (
            220,
            SOFT_NAVY,
            HALE_NAVY,
            "ENCRYPTED BACKUP",
            "Choose separately",
            "A OneDrive or Dropbox folder may receive the encrypted .orgchart-backup file.",
        ),
        (
            400,
            HexColor("#F3F6F4"),
            DARK_MATTER,
            "SAFE MIGRATION",
            "Restart to verify",
            "The app copies and checksums data, switches, and keeps the old recovery copy.",
        ),
    ]
    for x, fill, accent, title, value, note in cards:
        pdf.setFillColor(fill)
        pdf.rect(x, 110, 172, 83, stroke=0, fill=1)
        pdf.setFillColor(accent)
        pdf.rect(x, 110, 4, 83, stroke=0, fill=1)
        draw_label(pdf, title, x + 14, 176, accent)
        pdf.setFillColor(DARK_MATTER)
        pdf.setFont("Helvetica-Bold", 10.2)
        pdf.drawString(x + 14, 157, value)
        draw_wrapped_text(
            pdf,
            note,
            x + 14,
            140,
            144,
            "Helvetica",
            7.2,
            leading=10.3,
        )

    pdf.setFillColor(DARK_MATTER)
    pdf.rect(0, 0, PAGE_W, 94, stroke=0, fill=1)
    draw_label(pdf, "Requirements", 40, 72, ENERGY)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 9.2)
    pdf.drawString(40, 53, "macOS 13+ | Internet | Public GitHub repository access")
    pdf.setFont("Helvetica", 7.5)
    pdf.drawString(
        40,
        37,
        "Managed Mac: follow approved software, data, and support processes. Use Command-Q to stop the app.",
    )
    pdf.setFont("Helvetica", 7.1)
    pdf.drawString(
        40,
        21,
        "Draft source test - not a signed /Applications package or an approved production system.",
    )
    source_url = "https://github.com/adammalin/Organizational-Chart-Platform"
    pdf.setFillColor(ENERGY)
    pdf.setFont("Helvetica-Bold", 8.5)
    pdf.drawRightString(572, 21, source_url)
    source_width = stringWidth(source_url, "Helvetica-Bold", 8.5)
    pdf.linkURL(source_url, (572 - source_width, 14, 572, 29), relative=0)

    pdf.showPage()
    pdf.save()


def main() -> None:
    build_pdf(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
