# Live2D runtime attribution

This application contains Live2D Cubism SDK developed by Live2D Inc. of which the copyrights are held by Live2D Inc.

- `live2dcubismcore.min.js`: downloaded from the official pinned Cubism 5.2 hosting URL, https://cubism.live2d.com/sdk-web/core/05/live2dcubismcore.min.js . Its original copyright/license header is retained.
- Core is Redistributable Code under the Live2D Proprietary Software License Agreement; the downloaded English agreement is included as `LICENSE.html`. It is not covered by LaunchPad's MIT license.
- SDK publication terms: https://www.live2d.com/en/sdk/license/ . Model artwork has its own license.
- Renderer: `untitled-pixi-live2d-engine` 1.4.0 (MIT), https://github.com/Untitled-Story/untitled-pixi-live2d-engine ; PixiJS 8.22.0 (MIT), https://github.com/pixijs/pixijs . npm packages retain their licenses.

The modern renderer accepts Cubism 3/4/5 model3.json packages supported by the bundled Core. Cubism 2's discontinued runtime is not bundled. No user-supplied JavaScript is executed from model packages.

