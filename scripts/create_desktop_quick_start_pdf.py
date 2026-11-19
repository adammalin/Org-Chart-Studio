#!/usr/bin/env python3
"""Create the selectable-text command-line desktop quick-start guide."""

from pathlib import Path
import textwrap

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.pdfdoc import PDFString
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "ORNL-OrgChart-Studio-Desktop-Quick-Start.pdf"
PAGE_W, PAGE_H = letter
WINDOWS_COMMAND = (ROOT / "scripts" / "install-windows-command.txt").read_text().strip()
MAC_COMMAND = (ROOT / "scripts" / "install-macos-command.txt").read_text().strip()
INSTALL_PAGE = "https://adammalin.github.io/Team-App-Library/apps/orgchart-studio/install/#windows-install"

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
    pdf.drawString(40, 30, "ORNL OrgChart Studio | Web and desktop quick start | November 19, 2026")
    pdf.drawRightString(572, 30, f"PAGE {page_number} OF 4")


def code_box(pdf, title, lines, x, y, width, height, accent, actual_text=None):
    pdf.setFillColor(PALE)
    pdf.setStrokeColor(BORDER)
    pdf.rect(x, y, width, height, stroke=1, fill=1)
    pdf.setFillColor(accent)
    pdf.rect(x, y + height - 31, width, 31, stroke=0, fill=1)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 10.5)
    pdf.drawString(x + 13, y + height - 20, title)
    pdf.setFillColor(DARK)
    pdf.setFont("Courier", 7.2)
    cursor = y + height - 48
    if actual_text:
        # Preserve a single command when viewers copy visually wrapped PDF text.
        encoded = PDFString(actual_text).format(pdf._doc).decode("latin1")
        pdf._code.append(f"/Span << /ActualText {encoded} >> BDC")
    for line in lines:
        pdf.drawString(x + 13, cursor, line)
        cursor -= 11.1
    if actual_text:
        pdf._code.append("EMC")


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
        "Install and get to work.",
        "Public GitHub download, verified local runtime, private desktop app.",
        1,
    )
    label(pdf, "Before you begin", 40, 602)
    wrapped(
        pdf,
        "Use Terminal on Mac. On Windows, open Terminal, Command Prompt, or PowerShell. Copy the full command, paste, and press Enter. Use your normal account; administrator access and GitHub login are not needed.",
        40,
        583,
        532,
        size=9.3,
        leading=12.8,
    )
    code_box(
        pdf,
        "Mac - one command in Terminal",
        textwrap.wrap(MAC_COMMAND, width=110, break_long_words=False, break_on_hyphens=False),
        40,
        378,
        532,
        148,
        GREEN,
        actual_text=MAC_COMMAND,
    )
    wrapped(pdf, "Select the full command above and copy it. Display wrapping is not a separate step.", 54, 394, 500, size=7.5, leading=10)
    code_box(
        pdf,
        "Windows - one command in Terminal, Command Prompt, or PowerShell",
        textwrap.wrap(WINDOWS_COMMAND, width=110, break_long_words=False, break_on_hyphens=False),
        40,
        191,
        532,
        166,
        NAVY,
        actual_text=WINDOWS_COMMAND,
    )
    label(pdf, "OPEN INSTALL PAGE AND CLICK COPY", 54, 224, NAVY)
    pdf.linkURL(INSTALL_PAGE, (54, 215, 558, 239), relative=0, thickness=0)
    wrapped(pdf, "The command above is shown wrapped. The web page copies it as one line.", 54, 207, 500, size=7.5, leading=10)
    pdf.setFillColor(SOFT_GREEN)
    pdf.rect(40, 76, 532, 92, stroke=0, fill=1)
    label(pdf, "During setup", 56, 145)
    wrapped(
        pdf,
        "Allow several minutes. Setup downloads, installs, checks, and opens the app. These manual commands install public main. Codex uses the plugin's verified installer. On Mac, type y at Install the local MCP integration? [y/N] to connect AI, or press Return to skip.",
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
        ['Ask the ORNL - OrgChart Studio plugin in Codex: "Open OrgChart Studio."',
         'Or run: /bin/zsh "$HOME/OrgChart-Studio-source-test/scripts/start-mac-source-test.zsh"'],
        40,
        506,
        532,
        72,
        GREEN,
    )
    code_box(
        pdf,
        "Windows - easiest option",
        ['Ask the ORNL - OrgChart Studio plugin in Codex: "Open OrgChart Studio."',
         'Or run in PowerShell: & "$env:USERPROFILE\\OrgChart-Studio-source-test\\scripts\\start-windows-source-test.ps1"'],
        40,
        410,
        532,
        72,
        NAVY,
    )
    label(pdf, "Update", 40, 380)
    wrapped(
        pdf,
        "Make a fresh backup, close the app with its red X, and repeat the same installation command from page 1 for your system. The script downloads public main, rebuilds, tests, and opens it. For a newer local or development copy, ask Codex to inspect its version first; public main can be older.",
        40,
        361,
        532,
        size=9,
        leading=12.2,
    )
    step_card(pdf, "1", "LIVE LIBRARY", "Defaults to Application Support on Mac or AppData on Windows, outside the downloaded application folder.", 40, 212, 166, 104)
    step_card(pdf, "2", "BACKUP FOLDER", "Choose a separate local folder, OneDrive or Dropbox. Encryption is optional for each backup.", 223, 212, 166, 104, SOFT_NAVY, NAVY)
    step_card(pdf, "3", "RUN BACKUP", "Choose all or selected charts, choose protection, then use Run backup now before an update or migration.", 406, 212, 166, 104, PALE, DARK)
    pdf.setFillColor(NAVY)
    pdf.rect(40, 76, 532, 110, stroke=0, fill=1)
    label(pdf, "Privacy boundary", 56, 160, ENERGY)
    wrapped(
        pdf,
        "GitHub receives no charts, source documents, databases, or backup packages. The desktop window can contact only its private loopback server. Keep live data out of Git and cloud-sync folders. A cloud backup may be encrypted or readable; choose protection appropriate for the data and access controls.",
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
        "Codex can install and launch Studio, then help with charts and backups.",
        3,
    )
    step_card(pdf, "1", "ENABLE THE PLUGIN", "Install ORNL - OrgChart Studio in Codex. The plugin can find an existing app or install a missing one.", 40, 516, 166, 82)
    step_card(pdf, "2", "RESTART AI", "Quit and reopen ChatGPT Desktop or Codex once so it discovers orgchart_studio.", 223, 516, 166, 82, SOFT_NAVY, NAVY)
    step_card(pdf, "3", "OPEN AND CONNECT", "The plugin launches Studio and checks readiness. Use Install local AI integration if the MCP connection is missing.", 406, 516, 166, 82, PALE, DARK)

    label(pdf, "A good first prompt", 40, 478)
    pdf.setFillColor(NAVY)
    pdf.rect(40, 375, 532, 82, stroke=0, fill=1)
    pdf.setFillColor(ENERGY)
    pdf.rect(40, 375, 5, 82, stroke=0, fill=1)
    wrapped(
        pdf,
        'Open OrgChart Studio; install it if needed, then check the local app connection. Use the existing installation when it is already working. After it opens, help me update charts, review changes, save history, export, or back up my library.',
        58,
        431,
        490,
        font="Helvetica-Bold",
        size=8.7,
        leading=12,
        color=WHITE,
    )
    pdf.linkURL("https://chatgpt.com/plugins/Plugin_8765a02936388191b4ce25a3ad811246", (40, 516, 206, 598), relative=0, thickness=0)
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
        "Pause local AI access, limit it to selected charts, or remove the integration without changing charts. Retained-source extraction starts on and can be switched off for the session. Chart fields returned through MCP enter that AI conversation, so use only content approved for that AI environment.",
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
        "Windows setup logs: %LOCALAPPDATA%\\ORNL OrgChart Studio\\Installer. If setup fails, keep the log and repeat the page 1 command to repair. Never share backup passphrases or raw retained source files with AI.",
        56,
        111,
        500,
        font="Helvetica-Bold",
        size=8.1,
        leading=10.8,
        color=NAVY,
    )
    footer(pdf, 3)
    pdf.showPage()
    page_header(pdf, "Browser release candidate | no Studio account", "Choose web or desktop.", "One chart editor, with different file and connection capabilities.", 4)
    label(pdf, "Ask the companion plugin", 40, 600)
    wrapped(pdf, '"Open OrgChart Studio. Ask whether I want the web or desktop app, then help me open and save the right library." The plugin uses a verified release URL. This browser candidate has not been published yet; do not guess a production address.', 40, 579, 532, size=10, leading=14)
    step_card(pdf, "1", "OPEN THE FULL LIBRARY", "Use Open library for continued editing. A complete .orgchart-workspace file retains chart identities, sources, pending reviews and history. Merge backup creates copies.", 40, 397, 532, 104)
    step_card(pdf, "2", "SAVE OUTSIDE THE BROWSER", "Recovery is automatic in this browser. Save library writes a user-selected file and verifies its bytes where supported. Otherwise download and confirm the file. Encryption is optional.", 40, 274, 532, 104, SOFT_NAVY, NAVY)
    step_card(pdf, "3", "USE A SYNCED FOLDER", "Choose a local OneDrive or Dropbox folder. Studio verifies file writes, not cloud upload completion. Save at the end of each session and monthly update. Do not edit the same library in two places at once.", 40, 151, 532, 104, PALE, DARK)
    wrapped(pdf, "Desktop: Download full working library to continue in the browser. Open a portable file workspace to edit a web library separately from the desktop database. Desktop stdio MCP stays attached to the original database; browser tools target the open file workspace.", 40, 126, 532, font="Helvetica-Bold", size=8.6, leading=11.3)
    footer(pdf, 4)
    pdf.save()


if __name__ == "__main__":
    build_pdf(OUTPUT)
    print(OUTPUT)
