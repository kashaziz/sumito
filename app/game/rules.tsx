import type { ReactNode } from "react";
import type { Player } from "../../lib/game/engine";

const LIME = "#d5f04a";
const ORANGE = "#e85e2b";

function Marble({ x, color, ring, dot, ghost, fade, ids }: { x: number; color?: Player; ring?: string; dot?: boolean; ghost?: boolean; fade?: boolean; ids: string }) {
  if (ghost) return <circle cx={x} cy={22} r={9} fill="none" stroke={LIME} strokeWidth={1.5} strokeDasharray="3 2" />;
  return <g opacity={fade ? 0.35 : 1}>
    <circle cx={x} cy={22} r={9} fill={`url(#${ids}-${color})`} stroke={color === "white" ? "#c9c5bb" : "#050606"} strokeWidth={0.8} />
    {ring && <circle cx={x} cy={22} r={11.5} fill="none" stroke={ring} strokeWidth={1.8} />}
    {dot && <circle cx={x + 7} cy={14} r={2.6} fill={LIME} stroke="#1b1f20" strokeWidth={1} />}
  </g>;
}

const Arrow = ({ from, to }: { from: number; to: number }) => <g stroke={LIME} strokeWidth={2} fill={LIME}>
  <line x1={from} y1={40} x2={to - 4} y2={40} />
  <path d={`M${to} 40 l-6 -3.5 v7 z`} stroke="none" />
</g>;

function Picture({ children, label }: { children: ReactNode; label: string; ids: string }) {
  return <svg className="rule-picture" viewBox="0 0 150 46" role="img" aria-label={label}>
    {children}
  </svg>;
}

const rules = (ids: string) => [
  {
    title: "Pick a line",
    text: "Tap 1 to 3 of your marbles in a straight line. A green dot means that marble can move.",
    picture: <Picture ids={ids} label="Three dark marbles in a row, selected">
      <Marble ids={ids} x={30} color="black" ring={LIME} dot /><Marble ids={ids} x={54} color="black" ring={LIME} dot /><Marble ids={ids} x={78} color="black" ring={LIME} dot /><Marble ids={ids} x={110} color="black" />
    </Picture>,
  },
  {
    title: "Move one space",
    text: "Tap a glowing dot, or swipe. The whole line moves one space — along the line or sideways.",
    picture: <Picture ids={ids} label="A line of marbles moving one space to the right">
      <Marble ids={ids} x={22} color="black" fade /><Marble ids={ids} x={46} color="black" /><Marble ids={ids} x={70} color="black" /><Marble ids={ids} x={94} ghost />
      <Arrow from={30} to={100} />
    </Picture>,
  },
  {
    title: "Push a smaller line",
    text: "More beats fewer: 3 push 2 or 1, and 2 push 1. Equal lines cannot push.",
    picture: <Picture ids={ids} label="Three dark marbles pushing two light marbles">
      <Marble ids={ids} x={16} color="black" ring={LIME} /><Marble ids={ids} x={40} color="black" ring={LIME} /><Marble ids={ids} x={64} color="black" ring={LIME} />
      <Marble ids={ids} x={88} color="white" ring={ORANGE} /><Marble ids={ids} x={112} color="white" ring={ORANGE} />
      <Arrow from={70} to={134} />
    </Picture>,
  },
  {
    title: "Push 6 off to win",
    text: "A marble pushed past the edge is out. The first player to push out 6 wins.",
    picture: <Picture ids={ids} label="A light marble pushed off the board edge">
      <Marble ids={ids} x={34} color="black" /><Marble ids={ids} x={58} color="black" /><Marble ids={ids} x={82} color="white" />
      <line x1={100} y1={6} x2={100} y2={38} stroke={ORANGE} strokeWidth={2} strokeDasharray="4 3" />
      <Marble ids={ids} x={124} color="white" fade />
      <text x={104} y={45} fill={ORANGE} fontSize={8} fontWeight={700}>EDGE</text>
    </Picture>,
  },
];

/** `ids` must be unique per instance: SVG gradients defined inside a hidden copy do not paint. */
export function RulesCards({ ids }: { ids: string }) {
  return <div className="rules-wrap">
    <svg className="rule-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${ids}-black`} cx="34%" cy="28%"><stop offset="0" stopColor="#7a8381" /><stop offset=".35" stopColor="#1c2222" /><stop offset="1" stopColor="#050707" /></radialGradient>
        <radialGradient id={`${ids}-white`} cx="34%" cy="26%"><stop offset="0" stopColor="#fff" /><stop offset=".6" stopColor="#d7d3ca" /><stop offset="1" stopColor="#8f8c84" /></radialGradient>
      </defs>
    </svg>
    <ol className="rules">
    {rules(ids).map((rule, index) => <li key={rule.title}>
      {rule.picture}
      <div><b><span>{index + 1}</span>{rule.title}</b><p>{rule.text}</p></div>
    </li>)}
    </ol>
  </div>;
}
