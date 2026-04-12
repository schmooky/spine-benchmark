/**
 * Cross-platform native file dialogs via OS shell commands.
 * macOS: osascript (AppleScript)
 * Windows: PowerShell with System.Windows.Forms (via temp .ps1 file)
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';

/**
 * Run a PowerShell script by writing to a temp file and executing it.
 * Avoids all escaping issues with inline -Command strings.
 */
function runPowerShell(script: string): string | null {
  const ps1 = join(tmpdir(), `spine-watcher-dialog-${Date.now()}.ps1`);
  try {
    writeFileSync(ps1, script, 'utf8');
    const result = execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${ps1}"`,
      { encoding: 'utf8', timeout: 120_000, windowsHide: true },
    );
    return result.trim() || null;
  } catch {
    return null;
  } finally {
    try { unlinkSync(ps1); } catch { /* ignore */ }
  }
}

export function pickFile(prompt: string, extensions: string[]): string | null {
  const os = platform();

  if (os === 'darwin') {
    return pickFileMac(prompt, extensions);
  } else if (os === 'win32') {
    return pickFileWindows(prompt, extensions);
  } else {
    return pickFileLinux(prompt, extensions);
  }
}

function pickFileMac(prompt: string, extensions: string[]): string | null {
  const typeList = extensions.map(e => `"${e}"`).join(', ');
  const script = `POSIX path of (choose file of type {${typeList}} with prompt "${prompt}")`;
  try {
    const result = execSync(`osascript -e '${script}'`, { encoding: 'utf8' });
    return result.trim() || null;
  } catch {
    return null;
  }
}

function pickFileWindows(prompt: string, extensions: string[]): string | null {
  const filter = extensions.map(e => `*.${e}`).join(';');
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = "${prompt}"
$dialog.Filter = "Spine files (${filter})|${filter}|All files (*.*)|*.*"
$dialog.ShowHelp = $false
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.FileName
}
`;
  return runPowerShell(script);
}

function pickFileLinux(prompt: string, extensions: string[]): string | null {
  const filter = extensions.map(e => `*.${e}`).join(' ');
  try {
    const result = execSync(
      `zenity --file-selection --title="${prompt}" --file-filter="${filter}"`,
      { encoding: 'utf8' },
    );
    return result.trim() || null;
  } catch {
    return null;
  }
}

export function pickExecutable(prompt: string): string | null {
  const os = platform();

  if (os === 'darwin') {
    const script = `POSIX path of (choose file with prompt "${prompt}")`;
    try {
      const result = execSync(`osascript -e '${script}'`, { encoding: 'utf8' });
      return result.trim() || null;
    } catch {
      return null;
    }
  } else if (os === 'win32') {
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = "${prompt}"
$dialog.Filter = "Spine executable (Spine.exe, Spine.com)|Spine.exe;Spine.com|All files (*.*)|*.*"
$dialog.ShowHelp = $false
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.FileName
}
`;
    return runPowerShell(script);
  } else {
    try {
      const result = execSync(
        `zenity --file-selection --title="${prompt}"`,
        { encoding: 'utf8' },
      );
      return result.trim() || null;
    } catch {
      return null;
    }
  }
}
