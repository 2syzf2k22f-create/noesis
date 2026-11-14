// The big ideas of each opening, from the side Reg plays: how to attack, what to defend against,
// and the long-term strategic plan. Shown next to the explorer and drills.
export type Ideas = { attack: string[]; defence: string[]; strategy: string[] };

export const IDEAS: Record<string, Ideas> = {
  italian: {
    attack: ["The c4 bishop aims at f7, Black's weakest point; Ng5 ideas hit it twice.", "With c3 and d4 you build a big centre, then push d5 or e5 to gain space and kick the f6 knight.", "In slow (d3) lines, swing the knight Nb1-d2-f1-g3 and play for a kingside attack with Bg5/Nh4-f5."],
    defence: ["Watch ...Bxf2+ tricks and ...Ng4 hitting f2 once you castle.", "After ...d5 breaks, keep the e4 pawn defended or trade it on your terms; don't let the c4 bishop be hit with tempo by ...Na5.", "Don't rush Ng5 when it can be met by ...Qxg5 or leaves e4 hanging."],
    strategy: ["Main line: open the centre fast while Black is less developed.", "Pianissimo: a slow manoeuvring game; a3 + Ba2 keeps the bishop safe, then prepare d4 or a kingside push.", "Keep the light-squared bishop: it's your best piece in most lines."],
  },
  "two-knights": {
    attack: ["4.Ng5 attacks f7 twice at once; after 5.exd5 you're a pawn up.", "In the main line, Ne5 and Bd3/Qh5 ideas keep pressure on f7 and Black's kingside.", "Against ...Nxd5 the Nxf7 sacrifice or d4 lines give a crushing attack."],
    defence: ["After ...Na5 your bishop is hit: Bb5+ then retreat to e2; don't lose it.", "Black gets fast development for the pawn: castle quickly and don't grab more material.", "Traxler (...Bc5): calmly take with Nxf7 and know the Kxf2 lines; don't panic about your king."],
    strategy: ["You're a pawn up but behind in development: consolidate (d3, Nc3, castle), then the extra pawn tells.", "Trade pieces when you can; the endgame favours the extra pawn.", "Give the pawn back if needed to finish development."],
  },
  "ruy-lopez": {
    attack: ["Bb5 hits the c6 knight, the defender of e5: constant pressure on e5.", "The Nb1-d2-f1-g3 manoeuvre brings a knight to the kingside for Nf5/Qf3 attacks.", "Play d4 at the right time to open the centre while your pieces are better placed."],
    defence: ["Watch the Noah's Ark trap: ...b5 and ...c4 can trap the bishop on b3; keep a retreat to c2.", "Marshall (...d5 gambit): know the lines; Black gets a kingside attack for the pawn.", "Don't take on e5 too early when ...Qd4 forks or wins the pawn back with tempo."],
    strategy: ["Slow build-up: c3, h3, d4, then Nbd2-f1-g3; space in the centre is the long-term edge.", "Exchange line: double Black's pawns, trade queens, win with the better kingside majority in the endgame.", "Against the Berlin: the endgame where Black's king can't castle; use your e5 pawn and kingside majority."],
  },
  scotch: {
    attack: ["Immediate d4 opens the centre: develop faster and attack before Black organises.", "After ...Nf6 lines, e5 kicks the knight and gains space.", "Nb5 and Nd5 jumps hit c7 and f6."],
    defence: ["In ...Bc5 lines the d4 knight is a target: Be3 and c3 support it.", "...Qf6/...Qh4 hit f2 and e4: develop with tempo, don't over-protect.", "After Nxc6 bxc6 Black gets central pawns; keep them from rolling with ...d5."],
    strategy: ["A clean open game: piece activity over structure.", "Black's doubled c-pawns are a long-term target in the endgame.", "Castle early and use the half-open d-file."],
  },
  vienna: {
    attack: ["f4 attacks e5 and opens the f-file for a kingside attack.", "After fxe5 the e5 pawn cramps Black; Qe2, d3 and Nf3 build up.", "The Frankenstein-Dracula line (Bc4 Nxe4) gives a wild attack on f7 if you know it."],
    defence: ["...d5! is Black's best answer: don't overextend; meet it with fxe5 and Nf3.", "Watch ...Qh4+ when g3 is weak after f4.", "Don't leave the e4 knight's attack on c3 unanswered; d3 kicks it."],
    strategy: ["A King's Gambit idea with Nc3 first, so less risky.", "Pawn on e5 vs Black's knight on e4: trade it with d3 and keep the space.", "Castle short and use the f-file."],
  },
  "kings-gambit": {
    attack: ["Give f4 for the f-file and a big centre with d4; aim everything at f7.", "Bc4 + O-O pins the f-file against f7; sacrifices on f7 are common.", "In the Kieseritzky, Ne5 and d4 hit f7 and the g4 pawn."],
    defence: ["...Qh4+ checks are the danger: Nf3 first (3.Nf3) prevents it.", "Black's extra pawn on f4 and ...g5 chain: undermine with h4.", "Your king sits on an open diagonal; castle or keep it safe on f1 early."],
    strategy: ["Development and initiative > material; recapture f4 only when convenient.", "If the attack fades, you're just a pawn down: play energetically from move one.", "Trade Black's g/f pawns with h4 to open lines."],
  },
  london: {
    attack: ["Set up Bd3 + Ne5 + Qf3/Qh5 aimed at the kingside; h4-h5 if Black castles there.", "The e3-d4-c3 pyramid with Ne5 supported by f4 makes a stone-wall-style attack.", "Bxh7+ sacrifices appear when Black's knight leaves f6."],
    defence: ["...c5 and ...Qb6 hit b2: answer with Qb3 or Qc1, don't just lose the pawn.", "...Nh5 chases the f4 bishop: keep h3 or g3 ideas ready to keep the bishop.", "Don't let Black's ...e5 break come for free."],
    strategy: ["Same setup against almost anything: Bf4, e3, c3, Nd2, Ngf3, Bd3, O-O.", "Solid structure means you can play for a slow kingside build-up or a central e4 break.", "Keep the dark-squared bishop out before e3."],
  },
  qgd: {
    attack: ["Pin with Bg5 and pressure d5 and f6; play for e4 once Black's centre weakens.", "Minority attack (b4-b5) in the Exchange line to weaken c6.", "Kingside attacks with Bd3, Qc2 and a quick f3/e4 in some lines."],
    defence: ["Don't let Black free himself with ...c5 or ...e5 when it opens lines for his pieces.", "The Elephant trap: don't win the d5 pawn with Nxd5 if ...Nxd5 Bxd8 Bb4+ wins the queen back.", "Watch the c-file once it opens."],
    strategy: ["Space and a lasting bind; Black's light-squared bishop is his problem piece.", "Exchange line: carry out the minority attack to leave Black with a weak c-pawn.", "Keep pieces on when Black is cramped."],
  },
  catalan: {
    attack: ["The g2 bishop x-rays the long diagonal to b7 and a8: Ne5, Qc2/Qa4 pressure c6 and b7.", "Win the c4 pawn back with Qa4/Qc2 and keep the initiative.", "A timely e4 or d5 break opens the diagonal fully."],
    defence: ["In the Open Catalan Black keeps c4 with ...b5: be ready with a4 to hit it.", "Black's ...c5 break frees him: meet it with dxc5 and active pieces.", "Don't lose the g2 bishop for a knight; it's the whole point."],
    strategy: ["Long-term queenside pressure, often into a better endgame.", "Patience: Black's pieces are passive while the diagonal is open.", "Rooks to c1 and d1 behind the centre."],
  },
  english: {
    attack: ["A reversed Sicilian: control d5 with Nc3 and the g2 bishop.", "Queenside expansion with a3, Rb1 and b4-b5.", "In closed lines, e4 + f4 gives a kingside attack later."],
    defence: ["Black often takes space with ...e5 and ...d5: undermine it with c4xd5 and d3/d4.", "Don't let Black's knights settle on d4.", "Watch ...Bb4 pins on c3."],
    strategy: ["Flexible: transpose to setups you like based on Black's reply.", "The fianchetto bishop on g2 is your key piece; aim at b7.", "Slow positional play; open the queenside when ready."],
  },
  najdorf: {
    attack: ["Queenside counterattack: ...b5, ...b4, ...Rc8, ...Qc7 hit c3 and the white king if it castles long.", "The ...d5 break (when prepared) blows the centre open.", "Exchange-sacrifice ...Rxc3 is a typical way to shatter White's queenside."],
    defence: ["English Attack: White storms g4-g5-h4; get your own play first and keep ...h6/...Nfd7 ideas ready.", "6.Bg5 lines: watch e6 sacrifices (Nd5, Nxe6) and Bxf6 tricks; know the main line.", "Don't play ...e5 if d5 becomes a permanent hole without counterplay."],
    strategy: ["...a6 stops Nb5 and Bb5 and prepares ...b5.", "...e5 lines: fight for d5; trade the knight White can put there.", "Opposite-side castling races: count tempi."],
  },
  dragon: {
    attack: ["The g7 bishop on the long diagonal plus the half-open c-file aim at White's king on c1.", "...Rc8, ...Ne5-c4, ...a5-a4 and the ...Rxc3 exchange sacrifice.", "...Qa5 and ...b5 pawn storms."],
    defence: ["Yugoslav Attack: White plays Bh6 to trade your Dragon bishop and h4-h5 to open h-file: keep ...h5 ideas ready.", "Don't let White trade the g7 bishop for free.", "Guard d5 so Nd5 doesn't come in."],
    strategy: ["A race: your attack on the queenside must be faster than White's on the kingside.", "In quieter lines (Be2), play ...d5 and get easy equality.", "The g7 bishop is your soul: keep it."],
  },
  "alapin-black": {
    attack: ["Hit the e5 pawn: ...d6 and ...Nc6 pile up on it.", "Use the c-file once c3 and d4 trade off.", "...Bg4 pins and ...Qb6 pressure on b2 and d4."],
    defence: ["Don't let White's centre (c3+d4) stand; ...cxd4 at the right moment.", "Keep the d5 knight safe from c4 and Bc4 kicks.", "Watch for Bb5 pins on c6."],
    strategy: ["Isolated queen's pawn positions often arise: blockade d5 and trade pieces.", "Develop quickly; White's c3 takes the best square from his knight.", "...e6 and ...Be7 solid setup if in doubt."],
  },
  "french-advance": {
    attack: ["Hit White's pawn chain at its base: ...c5, ...Nc6, ...Qb6, then ...cxd4.", "...f6 attacks the head of the chain later.", "Pressure on d4 can win it outright if White is careless."],
    defence: ["Your light-squared bishop is locked in: plan ...Bd7 and ...Rc8, or trade it via ...b6 and ...Ba6.", "Watch White's kingside attack (Bd3, Qg4) on your king.", "Milner-Barry: don't grab d4 and get your queen trapped."],
    strategy: ["Queenside play vs White's kingside space.", "Blockading squares on d5/e6.", "Know the closed structure: pieces behind your pawn chain."],
  },
  "caro-kann": {
    attack: ["Counterattack the centre with ...c5 once developed.", "In the Advance, ...c5 and ...Nc6 hit d4, and ...Qb6 hits b2.", "Queenside play with ...b5 in some lines."],
    defence: ["In the Advance, the bayonet with g4 hits your bishop: know where it goes (g6, then ...h5 ideas).", "Classical: White's h4-h5 kicks your bishop; answer with ...h6.", "Watch for Nxf7 and Bxe6 sacrifices when your king is in the centre."],
    strategy: ["Solid structure; get the light-squared bishop out before ...e6.", "Endgames are good for you: fewer weaknesses.", "Play for a long, patient game."],
  },
  scandi: {
    attack: ["Quick development: ...Nf6, ...Bf5/...Bg4, ...c6, ...e6.", "Pins on f3 with ...Bg4 pressure d4.", "Long castling with ...O-O-O in some lines and rapid central pressure."],
    defence: ["Your queen comes out early: avoid being chased with tempo; a5 or d6 squares are safest.", "Watch Bd2 + Nd5 tricks against the a5 queen.", "Don't let White get Ne5 + Bc4 attacks on f7."],
    strategy: ["Solid c6-e6 structure, like a Caro-Kann with the bishop out.", "Trade pieces to ease the space disadvantage.", "Aim for ...c5 or ...e5 breaks later."],
  },
  pirc: {
    attack: ["Strike White's centre with ...e5 or ...c5 at the right moment.", "Queenside expansion with ...c6, ...b5 and ...a5.", "The g7 bishop works on the long diagonal once the centre opens."],
    defence: ["Austrian (f4) is aggressive: watch e5 pushes kicking the f6 knight.", "150 Attack (Be3, Qd2, Bh6): trade the bishop or castle carefully.", "Don't get crushed by the big centre: break it before it advances."],
    strategy: ["Hypermodern: let White build the centre, then attack it.", "Flexible structure: pick the break (...e5 or ...c5) based on White's setup.", "Keep pieces coordinated; avoid cramps."],
  },
  alekhine: {
    attack: ["Provoke pawn advances, then attack the overextended centre with ...d6, ...c5, ...Nc6.", "...Bg4 pins and pressure on e5.", "Hit the pawns from the side with ...f6 or ...c5."],
    defence: ["Four Pawns Attack is sharp: know the lines; don't fall behind in development.", "Keep your knight from being trapped.", "Watch e6 breaks and space squeezes."],
    strategy: ["Undermining a big centre that becomes a target.", "If White plays modestly, you get easy development.", "Patience: White's pawns are weak if they can't advance further."],
  },
  petrov: {
    attack: ["Symmetrical but dynamic: ...Nxe4 regains the pawn, then ...d5 and ...Bd6.", "Active pieces and a solid centre; counter with ...c5 or ...Bg4.", "Pressure the e-file once castled."],
    defence: ["Never copy White after 3.Nxe5: 3...Nxe4? 4.Qe2 wins material. Play 3...d6 first.", "Watch Qe2 pins on the e-file.", "Don't let White's pieces get better squares in the symmetrical structure."],
    strategy: ["Solid and drawish: aim for small edges in endgames.", "Know the main lines; most mistakes come from copying moves.", "Equalise first, then outplay."],
  },
  kid: {
    attack: ["Kingside pawn storm: ...Ne8/...Nd7, ...f5, ...f4, ...g5-g4 against White's king.", "...e5 and ...f5 breaks open lines.", "Piece sacrifices on the kingside are common in the Mar del Plata."],
    defence: ["White's queenside attack (c5, b4) is fast: time your kingside attack.", "Sämisch: watch Be3 + Qd2 + Bh6 ideas.", "Don't let White's d5 and c5 pawns become a crushing queenside."],
    strategy: ["Race on opposite wings: kingside attack vs queenside play.", "Closed centre after d5 means flank attacks.", "Allow White the centre, then strike back."],
  },
  nimzo: {
    attack: ["Pin the c3 knight to fight for e4 and the centre.", "Trade the bishop for the knight to double White's c-pawns, then target them.", "...c5 and ...d5 breaks hit the centre."],
    defence: ["Qc2 lines avoid doubled pawns: know how to equalise with ...c5 or ...d5.", "Don't trade the bishop for nothing; keep it until it doubles pawns or wins tempo.", "Watch White's bishop pair in open positions."],
    strategy: ["Structure vs bishop pair: keep the position closed if White gets the bishops.", "Fight for e4 with ...b6/...Bb7 setups.", "Solid and active: one of the best answers to 1.d4."],
  },
  grunfeld: {
    attack: ["Let White build a big centre, then hit it with ...c5, the g7 bishop and ...Nc6.", "...Qa5 and ...Bg4 pin and pressure d4.", "Queenside majority endgames favour you."],
    defence: ["The Exchange line gives White a big centre: know the d5 push lines.", "Russian System (Qb3): don't let the queen grab material for free.", "Watch d5 + e5 rolling the centre."],
    strategy: ["Pressure the centre with pieces, not pawns.", "Trade queens into a queenside majority endgame.", "Sharp theory: know the main lines."],
  },
  slav: {
    attack: ["Support d5 with ...c6 and develop the bishop actively to f5 or g4.", "Take on c4 and hold with ...b5 when allowed.", "...e5 or ...c5 breaks later."],
    defence: ["White wins c4 back with a4 and e3: know how to recapture comfortably.", "Watch Ne5 jumps hitting c4 and f7.", "Exchange line: symmetrical; don't get outplayed on the c-file."],
    strategy: ["Solid structure with the bishop outside the pawn chain.", "Equalise and then play for the better endgame.", "Semi-Slav setups give more dynamic play if you want it."],
  },
  qga: {
    attack: ["Give c4 back for fast development and ...c5 central play.", "...e5 lines hit the centre right away.", "Active pieces on the queenside with ...a6, ...b5."],
    defence: ["Don't hang on to the c4 pawn too long; it costs development.", "Watch e4 + d5 central pushes.", "Bxc4 then Qe2/Rd1 aims at d-file; keep the d-file covered."],
    strategy: ["Simple development and equal centre.", "Isolated queen's pawn positions arise: know how to blockade.", "Trade pieces to ease the position."],
  },
  dutch: {
    attack: ["...f5 controls e4; then ...e5 or ...f4 for kingside play.", "Leningrad: ...Qe8-h5, ...Ng4 and ...f4 pawn pushes.", "The g7 bishop on the long diagonal."],
    defence: ["Your king's diagonal (e8-h5) is weakened: watch early Qh5 or Bg5 tricks.", "Staunton Gambit (e4): know the lines; don't grab greedily.", "White's c4-d5 squeeze limits your bishop: plan ...e5."],
    strategy: ["Unbalanced: playing for a win with Black.", "Control e4 and fight on the kingside.", "Know when to switch to ...e5 central breaks."],
  },
};
