#!/usr/bin/env python3
"""Create the selectable-text command-line desktop quick-start guide."""

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "ORNL-OrgChart-Studio-Desktop-Quick-Start.pdf"
PAGE_W, PAGE_H = letter

GREEN = HexColor("#00662C")
NAVY = HexColor("#00454D")
DARK = HexColor("#373A36")
ENERGY = HexColor("#7DBA00")
SOFT_GREEN = HexColor("#E8F2EA")
SOFT_NAVY = HexColor("#E7F0F1")
PALE = HexColor("#F3F6F4")
BORDER = HexColor("#C8D3CE")
WHITE = white


def wrapped(pdf, text, x, y, width, font="Helvetica", size=9.2, leading=12.3, color=DARK):
    pdf.setFont(font, size)
    pdf.setFillColor(color)
    line = ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if line and stringWidth(candidate, font, size) > width:
            pdf.drawString(x, y, line)
            y -= leading
            line = word
        else:
            line = candidate
    if line:
        pdf.drawString(x, y, line)
        y -= leading
    return y


def label(pdf, text, x, y, color=GREEN):
    pdf.setFillColor(color)
    pdf.setFont("Helvetica-Bold", 8.2)
    pdf.drawString(x, y, text.upper())


def page_header(pdf, eyebrow, title, subtitle, page_number):
    pdf.setFillColor(GREEN)
    pdf.rect(0, PAGE_H - 148, PAGE_W, 148, stroke=0, fill=1)
    pdf.setFillColor(NAVY)
    pdf.rect(PAGE_W - 18, PAGE_H - 148, 18, 148, stroke=0, fill=1)
    pdf.setFillColor(ENERGY)
    pdf.rect(0, PAGE_H - 154, PAGE_W, 6, stroke=0, fill=1)
    label(pdf, eyebrow, 40, 756, WHITE)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 27)
    pdf.drawString(40, 714, title)
    pdf.setFont("Helvetica", 10.5)
    pdf.drawString(40, 685, subtitle)
    pdf.setFont("Helvetica-Bold", 32)
    pdf.drawRightString(570, 692, f"0{page_number}")


def footer(pdf, page_number):
    pdf.setFillColor(DARK)
    pdf.rect(0, 0, PAGE_W, 52, stroke=0, fill=1)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica", 7.2)
    pdf.drawString(40, 30, "ORNL OrgChart Studio | Command-line desktop quick start | August 5, 2026")
    pdf.drawRightString(572, 30, f"PAGE {page_number} OF 3")


def code_box(pdf, title, lines, x, y, width, height, accent):
    pdf.setFillColor(PALE)
    pdf.setStrokeColor(BORDER)
    pdf.rect(x, y, width, height, stroke=1, fill=1)
    pdf.setFillColor(accent)
    pdf.rect(x, y + height - 31, width, 31, stroke=0, fill=1)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 10.5)
    pdf.drawString(x + 13, y + height - 20, title)
    pdf.setFillColor(DARK)
    pdf.setFont("Courier", 6.35)
    cursor = y + height - 48
    for line in lines:
        pdf.drawString(x + 13, cursor, line)
        cursor -= 11.1


def step_card(pdf, number, title, body, x, y, width, height, fill=SOFT_GREEN, accent=GREEN):
    pdf.setFillColor(fill)
    pdf.rect(x, y, width, height, stroke=0, fill=1)
    pdf.setFillColor(accent)
    pdf.rect(x, y, 5, height, stroke=0, fill=1)
    pdf.setFont("Helvetica-Bold", 9.2)
    pdf.drawString(x + 14, y + height - 21, f"{number}  {title}")
    wrapped(pdf, body, x + 14, y + height - 39, width - 28, size=7.8, leading=10.5)


def build_pdf(output):
    output.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output), pagesize=letter, pageCompression=1)
    pdf.setTitle("ORNL OrgChart Studio Desktop Quick Start")
    pdf.setAuthor("ORNL OrgChart Studio")
    pdf.setSubject("Install, update, start, protect, and connect the macOS and Windows desktop app from the command line")

    page_header(
        pdf,
        "No signed installer required | macOS and Windows",
        "Install from the command line.",
        "Public GitHub download, verified local runtime, private desktop app.",
        1,
    )
    label(pdf, "Before you begin", 40, 602)
    wrapped(
        pdf,
        "Use Terminal on Mac or Windows PowerShell on Windows. Do not run as administrator. These commands download public application code only; no GitHub account or GitHub login is needed.",
        40,
        583,
        532,
        size=9.3,
        leading=12.8,
    )
    code_box(
        pdf,
        "Mac - paste all five lines into Terminal",
        [
            "/usr/bin/curl --fail --location --show-error \\",
            "  --output \"$HOME/Downloads/orgchart-studio-install.zsh\" \\",
            "  \"https://raw.githubusercontent.com/adammalin/Org-Chart-Studio/main/scripts/bootstrap-mac-source-test.zsh\"",
            "/bin/zsh \"$HOME/Downloads/orgchart-studio-install.zsh\" \\",
            "  \"$HOME/OrgChart-Studio-source-test\"",
        ],
        40,
        378,
        532,
        148,
        GREEN,
    )
    code_box(
        pdf,
        "Windows - paste all six lines into PowerShell",
        [
            "Invoke-WebRequest -UseBasicParsing `",
            "  -Uri \"https://raw.githubusercontent.com/adammalin/Org-Chart-Studio/main/scripts/bootstrap-windows-source-test.ps1\" `",
            "  -OutFile \"$env:TEMP\\orgchart-studio-install.ps1\"",
            "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `",
            "  -File \"$env:TEMP\\orgchart-studio-install.ps1\" `",
            "  -TargetDirectory \"$env:USERPROFILE\\OrgChart-Studio-source-test\"",
        ],
        40,
        191,
        532,
        166,
        NAVY,
    )
    pdf.setFillColor(SOFT_GREEN)
    pdf.rect(40, 76, 532, 92, stroke=0, fill=1)
    label(pdf, "During setup", 56, 145)
    wrapped(
        pdf,
        "The script records the exact GitHub commit and archive SHA-256, prepares a pinned Node.js runtime if needed, installs exact dependencies, builds the app, and runs its Electron/GUI/storage/AI smoke check. At Install the local MCP integration? [y/N], type y for ChatGPT Desktop or Codex access, or press Return to skip it.",
        56,
        125,
        500,
        size=8.2,
        leading=11.2,
    )
    footer(pdf, 1)
    pdf.showPage()

    page_header(
        pdf,
        "Everyday use | safe updates and private storage",
        "Start, update, and protect.",
        "Application code and chart data stay separate.",
        2,
    )
    label(pdf, "Start later", 40, 602)
    code_box(
        pdf,
        "Mac - easiest option",
        ["Double-click Start-OrgChart-Studio.command in the OrgChart-Studio-source-test folder."],
        40,
        506,
        532,
        72,
        GREEN,
    )
    code_box(
        pdf,
        "Windows - easiest option",
        ["Double-click Start-OrgChart-Studio.cmd in the OrgChart-Studio-source-test folder."],
        40,
        410,
        532,
        72,
        NAVY,
    )
    label(pdf, "Update", 40, 380)
    wrapped(
        pdf,
        "Make a fresh backup, close the app with its red X, and repeat the same installation commands from page 1. The script downloads one exact current commit, removes obsolete application files, preserves the private runtime and working folders, rebuilds, tests, and starts the updated copy.",
        40,
        361,
        532,
        size=9,
        leading=12.2,
    )
    step_card(pdf, "1", "LIVE LIBRARY", "Defaults to Application Support on Mac or AppData on Windows, outside the downloaded application folder.", 40, 212, 166, 104)
    step_card(pdf, "2", "BACKUP FOLDER", "Choose a different folder in Backup & restore. OneDrive or Dropbox is allowed for encrypted packages.", 223, 212, 166, 104, SOFT_NAVY, NAVY)
    step_card(pdf, "3", "RECOVERY FILE", "Back up all charts or selected charts to one .orgchart-backup file before an update or migration.", 406, 212, 166, 104, PALE, DARK)
    pdf.setFillColor(NAVY)
    pdf.rect(40, 76, 532, 110, stroke=0, fill=1)
    label(pdf, "Privacy boundary", 56, 160, ENERGY)
    wrapped(
        pdf,
        "GitHub receives no charts, source documents, databases, or backup packages. The desktop window can contact only its private loopback server. Keep live data out of Git and cloud-sync folders; use optional encryption before placing backup packages in OneDrive or Dropbox.",
        56,
        139,
        500,
        font="Helvetica-Bold",
        size=8.3,
        leading=11.4,
        color=WHITE,
    )
    footer(pdf, 2)
    pdf.showPage()

    page_header(
        pdf,
        "Optional local AI | human-reviewed changes",
        "Connect AI locally.",
        "AI proposes. You review. OrgChart Studio remains the source of truth.",
        3,
    )
    step_card(pdf, "1", "INSTALL", "Type y at the setup prompt, or use Install local AI integration in the app later.", 40, 516, 166, 82)
    step_card(pdf, "2", "RESTART AI", "Quit and reopen ChatGPT Desktop or Codex once so it discovers orgchart_studio.", 223, 516, 166, 82, SOFT_NAVY, NAVY)
    step_card(pdf, "3", "OPEN THE APP", "OrgChart Studio must be running before an AI can call its local tools.", 406, 516, 166, 82, PALE, DARK)

    label(pdf, "A good first prompt", 40, 478)
    pdf.setFillColor(NAVY)
    pdf.rect(40, 375, 532, 82, stroke=0, fill=1)
    pdf.setFillColor(ENERGY)
    pdf.rect(40, 375, 5, 82, stroke=0, fill=1)
    wrapped(
        pdf,
        'Use the orgchart_studio MCP server. List the charts first. Open the chart I name, then stage the smallest reviewed proposal for this change: "Renee is retiring soon. Show that position as vacant." Do not save it directly.',
        58,
        431,
        490,
        font="Helvetica-Bold",
        size=8.7,
        leading=12,
        color=WHITE,
    )
    label(pdf, "What happens next", 40, 338)
    wrapped(
        pdf,
        "The app shows a green activity edge while AI uses the local tools. A proposal compares Before and After. Apply, reject, or review later. AI can also validate structured data and stage a new chart import, but it cannot silently overwrite a saved chart.",
        40,
        319,
        532,
        size=9,
        leading=12.4,
    )
    pdf.setFillColor(SOFT_GREEN)
    pdf.rect(40, 156, 532, 106, stroke=0, fill=1)
    label(pdf, "Controls that stay with you", 56, 238)
    wrapped(
        pdf,
        "Pause local AI access, limit it to selected charts, or remove the integration without changing charts. Retained-source extraction starts off and is session-only. Chart fields returned through MCP enter that AI conversation, so use only content approved for that AI environment.",
        56,
        217,
        500,
        size=8.7,
        leading=11.8,
    )
    pdf.setFillColor(PALE)
    pdf.rect(40, 76, 532, 58, stroke=0, fill=1)
    wrapped(
        pdf,
        "If setup fails, repeat the page 1 commands. They safely repair the application copy. Never give an AI backup passphrases or ask it to return raw retained source files.",
        56,
        111,
        500,
        font="Helvetica-Bold",
        size=8.1,
        leading=10.8,
        color=NAVY,
    )
    footer(pdf, 3)
    pdf.save()


if __name__ == "__main__":
    build_pdf(OUTPUT)
    print(OUTPUT)
