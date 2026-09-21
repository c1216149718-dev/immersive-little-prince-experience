# The Little Prince: An immersive web experience

This project is an interactive storybook inspired by *The Little Prince*. It guides the visitor through B612, the rose, the six-world theatre sequence, and the fox using React, TypeScript, Three.js, and a cinematic paper-stage visual language. The experience is designed for a modern desktop browser with WebGL enabled.

## What is included

- A chapter-based journey through B612, the rose, Worlds, and Fox.
- A 3D Little Prince experience built with React Three Fiber and Three.js.
- The Worlds V2 paper theatre with volumetric curtains, layered clouds, hanging and stick stars, stage lighting, depth of field, and a wood floor that receives shadows.
- Six character-specific theatre compositions for the king, vain man, tippler, businessman, lamplighter, and geographer.
- Interactive cursor movement, chapter navigation, scene transitions, and audio controls.
- Public runtime assets for the character models, stage model, paper textures, and theatre props.

## Tech stack

- React 19 and TypeScript
- Vite 7
- Three.js, React Three Fiber, and Drei
- GSAP for timeline animation
- Zustand for shared experience state
- Tailwind CSS through the Vite plugin

## Run it locally

Use Node.js 20.19 or newer, or Node.js 22 or newer.

```bash
git clone https://github.com/c1216149718-dev/immersive-little-prince-experience.git
cd immersive-little-prince-experience
npm install
npm run dev
```

Vite prints the local development URL in the terminal. Open that URL in a desktop browser, then start the experience from the opening screen.

## Build and preview the production bundle

```bash
npm run build
npm run preview
```

The production build is written to `dist/`. The preview command serves that build locally so you can check the bundled experience before deployment.

## Interaction

- Click or press the opening control to enter the story.
- Use the chapter controls to revisit B612, Rose, Worlds, or Fox.
- Move the pointer across the stage to create a small air-like response in the curtains and paper props.
- Let the Worlds sequence play to see the curtain opening, stage setup, six character scenes, the warm star, and the transition into Fox.
- Enable audio from the on-screen control when the browser requires a user gesture.

## Project structure

```text
src/
  three/        Three.js scenes, models, lighting, stage systems, and motion
  ui/            Navigation, narrative copy, loader, cursor, and chrome
  narrative.ts  Chapter and story data
  state.ts      Shared experience state
public/
  models/       Runtime GLB files
  textures/     Runtime paper, rose, stage, and character textures
scripts/        Asset and verification utilities
```

The Worlds V2 implementation is documented in [WORLDS_THEATRE_V2.md](WORLDS_THEATRE_V2.md). Additional design and model notes are available in the other Markdown files at the repository root.

## Verification

Run the TypeScript check and production build from the project root:

```bash
npx tsc --noEmit
npm run build
```

The repository keeps generated source captures and verification exports out of version control. The runtime assets required by the website live under `public/` and are included in the repository.

## Browser notes

- Use a current Chromium, Firefox, or Safari desktop browser with WebGL enabled.
- The first visit may take longer while GLB and texture assets load.
- Browser autoplay policies may require one click before audio can start.
- Mobile browsers are not the primary target for this cinematic 3D presentation.

## License and assets

No separate open-source license has been added yet. Treat the source code and supplied visual assets as project-owned material unless the repository owner provides different usage terms.
