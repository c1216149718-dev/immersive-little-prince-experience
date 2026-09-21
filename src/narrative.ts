export type Style = "ink" | "drift";
export interface Line { a: number; b: number; x: string; y: string; text: string; style: Style; hand?: string; center?: boolean; size?: string; core?: boolean }

export const LINES: Line[] = [
  { a: 0.04, b: 0.7, x: "50%", y: "46%", center: true, style: "ink", text: "Before the stars, there was only the waiting.", hand: "move, and the dark will answer" },
  { a: 0.5, b: 1.05, x: "12%", y: "64%", style: "drift", text: "Somewhere out there, a *grain of light* is a whole world." },
  { a: 1.15, b: 1.72, x: "60%", y: "26%", style: "ink", text: "Asteroid B612. A volcano, one rose, and a chair for sunsets." },
  { a: 1.66, b: 2.12, x: "14%", y: "72%", style: "drift", text: "Slower. He does not like to be hurried." },
  { a: 2.08, b: 2.48, x: "58%", y: "24%", style: "drift", text: "Leaving is easy. It is the *staying* that must be learned." },
  { a: 2.55, b: 2.93, x: "50%", y: "50%", center: true, style: "ink", text: "One small rose can fill a whole world." },
  { a: 3.2, b: 3.72, x: "10%", y: "20%", style: "ink", text: "Touch her lightly. She has only four thorns.", hand: "your cursor is a breath of wind" },
  { a: 3.73, b: 4.10, x: "64%", y: "74%", style: "drift", core: true, text: "A petal remembers every hand that came too close." },
  { a: 4.20, b: 4.82, x: "54%", y: "28%", style: "ink", text: "One petal let go. It did not fall; it *rose*." },
  { a: 5.05, b: 5.55, x: "10%", y: "18%", style: "ink", text: "There are grown-ups on every rock. They are all very busy." },
  { a: 5.56, b: 5.94, x: "13%", y: "53%", style: "drift", text: "the king", hand: "who commands the sun to set — at the proper hour" },
  { a: 6.02, b: 6.40, x: "13%", y: "53%", style: "drift", text: "the vain man", hand: "who hears nothing but praise" },
  { a: 6.48, b: 6.86, x: "13%", y: "53%", style: "drift", text: "the tippler", hand: "who drinks to forget that he drinks" },
  { a: 6.94, b: 7.32, x: "13%", y: "53%", style: "drift", text: "the businessman", hand: "who owns the stars because he counted them first" },
  { a: 7.40, b: 7.78, x: "13%", y: "53%", style: "drift", text: "the lamplighter", hand: "who lights a lamp for no one, faithfully" },
  { a: 7.86, b: 8.32, x: "13%", y: "53%", style: "drift", text: "the geographer", hand: "who has never seen his own mountains" },
  { a: 8.44, b: 8.9, x: "50%", y: "42%", center: true, style: "ink", text: "One star was *warmer* than the others." },
  { a: 9.06, b: 9.7, x: "9%", y: "16%", style: "ink", text: "Move slowly. He is not tame.", hand: "the pace of your cursor is your patience" },
  { a: 10.12, b: 11.30, x: "56%", y: "22%", style: "drift", core: true, text: "The wheat will keep the colour of your hair." },
  { a: 11.38, b: 11.75, x: "60%", y: "34%", style: "drift", text: "The sand rises softly, remembering the stars." },
  { a: 11.72, b: 12.3, x: "59%", y: "39%", style: "drift", core: true, text: "Look up. Everything you loved is still there, only *quieter*." },
  { a: 12.90, b: 14.5, x: "50%", y: "50%", center: true, style: "ink", text: "Choose one. Any one. That is where he is laughing." },
];


/** Reading is budgeted in seconds; story time keeps advancing throughout. */
export function readingDuration(line: Line) {
  const text=(line.text+" "+(line.hand??"")).replace(/\*/g,"");
  const chinese=(text.match(/[\u3400-\u9fff]/g)??[]).length;
  const words=text.replace(/[\u3400-\u9fff]/g,"").trim().split(/\s+/).filter(Boolean).length;
  return line.core ? 9.2 : Math.min(8.2,Math.max(6.2,3.7+words*.21+chinese*.10));
}
export const lineTiming = (line: Line) => ({
  revealEnd: line.a===12.90 ? 12.98 : line.a+(line.b-line.a)*.16,
  fadeOutStart: line.a===12.90 ? 14 : line.a+(line.b-line.a)*.84,
});

/** Local tempo changes preserve all authored scene coordinates and transitions. */
export function narrativeRate(t:number) {
  let rate=.1;
  for(const line of LINES){
    if(t>=line.a && t<line.b && line.a<12.9){
      rate=Math.min(rate,(line.b-line.a)/readingDuration(line));
    }
  }
  // A breath after the prince arrives; no pause and no new caption yet.
  if(t>=11.30 && t<11.38)rate=.08;
  // The last lines finish at 12.86, followed by 0.8s of quiet sky.
  if(t>=12.68)rate=.05;
  return rate;
}
