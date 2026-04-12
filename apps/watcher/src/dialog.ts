/**
 * Cross-platform native file dialogs via OS shell commands.
 * macOS: osascript (AppleScript)
 * Windows: PowerShell with System.Windows.Forms
 */
import { execSync } from 'node:child_process';
import { platform } from 'node:os';

export function pickFile(prompt: string, extensions: string[]): string | null {
  const os = platform();

  if (os === 'darwin') {
    return pickFileMac(prompt, extensions);
  } else if (os === 'win32') {
    return pickFileWindows(prompt, extensions);
  } else {
    // Linux: try zenity, kdialog, or fallback
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
    return null; // user cancelled
  }
}

function pickFileWindows(prompt: string, extensions: string[]): string | null {
  const filter = extensions.map(e => `*.${e}`).join(';');
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Title = '${prompt.replace(/'/g, "''")}'
$d.Filter = 'Spine files (${filter})|${filter}|All files (*.*)|*.*'
$d.ShowHelp = $false
if ($d.ShowDialog() -eq 'OK') { $d.FileName } else { '' }
`;
  try {
    const result = execSync(
      `powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
      { encoding: 'utf8' },
    );
    return result.trim() || null;
  } catch {
    return null;
  }
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
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Title = '${prompt.replace(/'/g, "''")}'
$d.Filter = 'Spine executable (Spine.exe;Spine.com)|Spine.exe;Spine.com|All files (*.*)|*.*'
$d.ShowHelp = $false
if ($d.ShowDialog() -eq 'OK') { $d.FileName } else { '' }
`;
    try {
      const result = execSync(
        `powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
        { encoding: 'utf8' },
      );
      return result.trim() || null;
    } catch {
      return null;
    }
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
