import { splitMath } from "../src/core/mathText";
for (const t of ["The roots are $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$", "$$\\sum_{r=1}^{n} r = \\frac{n(n+1)}{2}$$", "It costs $5 and $10", "$\\frac{1}{$", "Price \\$5 vs $x$", "half-typed $x^2 + "])
  console.log(JSON.stringify(t), "->", JSON.stringify(splitMath(t)));
