# Changelog

## [0.1.1](https://github.com/panelarr/web/compare/v0.1.0...v0.1.1) (2026-11-13)


### Features

* **admin:** Health in place of System, and Updates for extensions ([#11](https://github.com/panelarr/web/issues/11)) ([8f82c0b](https://github.com/panelarr/web/commit/8f82c0b4ce5ac5fb28248efd994ef6404dc08b0c))
* **auth:** explain single sign-on starts the server refuses ([ed9e169](https://github.com/panelarr/web/commit/ed9e16980ab4cf1d517afb8879e089552f78fc9f))
* **auth:** explain single sign-on starts the server refuses ([0628ed2](https://github.com/panelarr/web/commit/0628ed2ba8e5eaf83c6a854ca56a810a1bef2e90))
* **auth:** sign in, link logins and accept invites with single sign-on ([77be191](https://github.com/panelarr/web/commit/77be19130699121402db94d3c94f49b34f77d418))
* **auth:** sign in, link logins and accept invites with single sign-on ([87f3664](https://github.com/panelarr/web/commit/87f3664a97260d60298b17543cfe083d11f4d1ad))
* **imports:** apply, progress, report and choosing a series' work ([9c993d4](https://github.com/panelarr/web/commit/9c993d41abc8fe866acf764511710237ffc36013))
* **imports:** apply, progress, report and choosing a series' work ([65c833c](https://github.com/panelarr/web/commit/65c833c48f843750001e044e58a2924aa5b287a6))
* **imports:** Settings → Import, upload and preview ([f3b56af](https://github.com/panelarr/web/commit/f3b56af8c6a96e13b59f6abcfbf894f373f94e83))
* **imports:** Settings → Import, upload and preview ([5e2773b](https://github.com/panelarr/web/commit/5e2773b8d94fe4756d906b8731b69fd4c3e24a46))
* **library:** content-rating filter in views ([3d292fd](https://github.com/panelarr/web/commit/3d292fd58deb5bb0c7285b0d17d744da6a13b836))
* **library:** content-rating filter in views ([5a02632](https://github.com/panelarr/web/commit/5a026329c1560b9eef637a9569f61e47f48143a9))
* **library:** saved library views ([#12](https://github.com/panelarr/web/issues/12)) ([40f3aa6](https://github.com/panelarr/web/commit/40f3aa69d36ddea71af43ab10f24cfa235914bcd))
* search clear button, extension order, description on the series page ([#10](https://github.com/panelarr/web/issues/10)) ([a502fe1](https://github.com/panelarr/web/commit/a502fe14dffe19ecd135c42b3258b973c77303f0))


### Bug Fixes

* **covers:** a cover starts over when its row shows another series ([#8](https://github.com/panelarr/web/issues/8)) ([f928b26](https://github.com/panelarr/web/commit/f928b2652364a6b60e27a5ba4558c8248f89aa04))
* **deps:** patched fast-uri, serialize-javascript and minimatch ([#6](https://github.com/panelarr/web/issues/6)) ([9c7d627](https://github.com/panelarr/web/commit/9c7d627c994ee147c9d2874fd209b81639febb38))
* Escape in a dialog clears its search first; no retries without meta; Check now spins only when asked ([#13](https://github.com/panelarr/web/issues/13)) ([7813f9a](https://github.com/panelarr/web/commit/7813f9a8a334ea0e35a0bd4efc2a3a7deb406b5f))
* leave the reader without stacking it, open added works on Sources, say when an attach fails ([#9](https://github.com/panelarr/web/issues/9)) ([3d324c1](https://github.com/panelarr/web/commit/3d324c1cd5da0cecb5dda904c981b467e2d39914))
* time-of-day-proof History test; sync spec; flag best-guess attaches ([#14](https://github.com/panelarr/web/issues/14)) ([84e93e2](https://github.com/panelarr/web/commit/84e93e2b52cdc680ee6a6d9efc21ec06a539cac1))

## 0.1.0 (2026-11-09)


### Features

* **admin:** users, invites, plugins, sources and system pages ([00bc67f](https://github.com/panelarr/web/commit/00bc67f36876cc8bb2d33cd86773b50755c5db99))
* **auth:** first-run wizard, sign-in, invites and account settings ([150a90f](https://github.com/panelarr/web/commit/150a90f6f7363a96d841269f5da0452322c89fe7))
* **browse:** works in your library open there, and Add moves on to them ([621c97a](https://github.com/panelarr/web/commit/621c97a340763fb664e9d40f15c8b7f0fa1e59aa))
* **catalog:** search, browse with filters, and the entry page ([835dd7f](https://github.com/panelarr/web/commit/835dd7f0b19de5857eca84fc4c2e91f66152d1dc))
* **downloads:** downloads, the downloads page and storage ([07006ef](https://github.com/panelarr/web/commit/07006ef2de3e555c8567454847d6374bca31bff5))
* **events:** refresh a plugin when the server reports its health ([7219dab](https://github.com/panelarr/web/commit/7219dabc4d0c832a6aafe7ab887ab4e489ddadc1))
* **extensions:** an Extensions tab for plugins that host many sites ([b9fbd57](https://github.com/panelarr/web/commit/b9fbd570cdeda1197a059133990ee35f43cb9078))
* **extensions:** image retries per extension, and a source's own ([3f73d90](https://github.com/panelarr/web/commit/3f73d909837785edf3f81b30dc245a3410903865))
* **history:** a History tab of what you read ([6c860b8](https://github.com/panelarr/web/commit/6c860b88afcf6103c6b377057a2d9eb501de8f8c))
* **jobs:** jobs, runs, the task queue and live events ([bf16e99](https://github.com/panelarr/web/commit/bf16e99afaecdab028bbbcb4d0e0a4f7510f129d))
* **jobs:** one Jobs view for the server, the metadata service and plugins ([9f66ccc](https://github.com/panelarr/web/commit/9f66ccc8a6b785d5a94c9ef911f0af95d5cb7b12))
* **jobs:** say why a job can't run now, and show it paused ([40bf625](https://github.com/panelarr/web/commit/40bf62552719c51aeea7c3c30359bab8dcad087e))
* **library:** library grid, fixing matches, and browsing sources ([ba529a2](https://github.com/panelarr/web/commit/ba529a2e6256b2b91eda6380f2c9b02f3f1dcd5f))
* **library:** search behind an icon in the title row on phones ([2565c48](https://github.com/panelarr/web/commit/2565c48170fa5f8ea4f6da52fb9418e08dd1eec9))
* **library:** unread badges, a continue button and one sheet to arrange it ([645caa3](https://github.com/panelarr/web/commit/645caa35d316902b342cccc0ed9d43ef9c4ee5ec))
* **meta:** review suspected duplicates, with the decision model ([12dc5e6](https://github.com/panelarr/web/commit/12dc5e6ee0f33acc3d22ad113147507e664bf622))
* **meta:** the metadata service's health, providers and sync runs ([86ff8a9](https://github.com/panelarr/web/commit/86ff8a9f6b67b8e2aafc21959042d7ad72c6efb2))
* **meta:** the search engine's state and settings, and rebuilding its index ([c40ed4a](https://github.com/panelarr/web/commit/c40ed4af0f85116ccb1fbd163e1b9fa9bd4f9916))
* **network:** a plugin's own proxies, solvers and profiles ([f65410d](https://github.com/panelarr/web/commit/f65410d50a9b168dd4978479e45a06a83330906d))
* **network:** Admin -&gt; Network, Panelarr's own proxies, solvers and profiles ([d107983](https://github.com/panelarr/web/commit/d10798324fdd5f88e53cac5f36b5f46638b561f8))
* **network:** choose a network profile on a plugin, extension, source or provider ([df04df5](https://github.com/panelarr/web/commit/df04df5da4eb064780cc7821aafce4af379253ed))
* **plugins:** stores, reload and sources' health checks on a plugin's page ([2dbd31a](https://github.com/panelarr/web/commit/2dbd31aed9f1cc6daf3dfc616cdad1d18f3115ef))
* **pwa:** install, offline notice, accessibility checks and budgets ([dd4ed74](https://github.com/panelarr/web/commit/dd4ed74b6652728f306b43d6cf920ae5afbcf741))
* **reader:** double page, horizontal scroll, and finishing touches ([e4fec84](https://github.com/panelarr/web/commit/e4fec84d63b01873dc3faaa038353adf5db1c935))
* **reader:** the reader, page by page and as a long strip ([5daa9de](https://github.com/panelarr/web/commit/5daa9de88b5e9126a76efe32ff69ae27814a01c4))
* **reader:** thin bars, a chapters sheet and one tabbed settings sheet ([d132205](https://github.com/panelarr/web/commit/d13220514271d29cbc31449baf0250ae289a3644))
* **sources:** set up a source's own settings ([f61ad6e](https://github.com/panelarr/web/commit/f61ad6e444901957f6c215a6ba2e7a76a38c9c73))
* **sources:** show each source's extension, and Not available ([1eeca19](https://github.com/panelarr/web/commit/1eeca199db4750b08974327609b64a6255eb08a3))
* **sources:** sources are an admin concern ([556a01f](https://github.com/panelarr/web/commit/556a01f915110065e5b9477d26dea42b028fb854))
* **sources:** work-scoped source search, Off and Absent sources ([d51440d](https://github.com/panelarr/web/commit/d51440d4d861110701b4e657802f4b2f93f39b12))
* **theme:** themes, accent and key colours, and fonts saved per user ([caf606c](https://github.com/panelarr/web/commit/caf606ce702598c8421adf7a011e70de336a501a))
* **updates:** an Updates tab of new chapters in your library ([fd0b653](https://github.com/panelarr/web/commit/fd0b65399e40e1e0ec7fd0e03a389ebd8d50944e))
* **works:** a calm, dense series page on phones ([b753025](https://github.com/panelarr/web/commit/b7530258bc24e0a42eaef57a0934709f3a7e8680))
* **works:** a plainer series page with icon menus and select mode ([2db8c9d](https://github.com/panelarr/web/commit/2db8c9da663cc306588701d9e0c51ae26e20853d))
* **works:** bookmark chapters from the list and the reader ([d37c44d](https://github.com/panelarr/web/commit/d37c44d9314765e3e7286b6729c653102330989d))
* **works:** unified chapters and a tab per source ([eb97640](https://github.com/panelarr/web/commit/eb97640c0b6b83d802170d90356a7d431999ce0f))


### Bug Fixes

* **admin:** edit list settings such as extension stores ([5015c14](https://github.com/panelarr/web/commit/5015c14518fb94113e0f6bf08b51ea2ad45898a1))
* **admin:** show plugin settings in their schema's order ([65fbfe2](https://github.com/panelarr/web/commit/65fbfe2ff0e2d5662923d7c98230713aba510692))
* **deps:** bump seroval and undici in the lockfile to fixed versions ([a597feb](https://github.com/panelarr/web/commit/a597feb62ba15cb0e1da730766f7e9ff4e4954e6))
* **deps:** bump seroval and undici in the lockfile to fixed versions ([543c39d](https://github.com/panelarr/web/commit/543c39dec9ccd4129cabfd76735bc26a228b2345))
* **extensions:** keep the store's list, hide sources that don't exist ([743eb09](https://github.com/panelarr/web/commit/743eb092b52c4ea7f741c1a4f8492244cd1ffdb1))
* **meta:** the built-in search backend is healthy, without an index ([f530dc5](https://github.com/panelarr/web/commit/f530dc521669cecae61166048df1d4cbb76de906))
* no failed requests before sign-in, plain versions, empty catalogue ([8154eb1](https://github.com/panelarr/web/commit/8154eb1eaa7084f0937b58aa419ce7f2b7887369))
* **reader:** a long strip loads as many pages ahead as asked, in order ([4bcf68a](https://github.com/panelarr/web/commit/4bcf68aef75484001d769771feb72724c4e6be5d))
* **reader:** back to the series the server names when a chapter fails ([ff7d11f](https://github.com/panelarr/web/commit/ff7d11f58e51d61d72cb300f5f53f4eb627d5aaa))
* **reader:** deferred corrections near the strip's ends and in its position ([6bedb02](https://github.com/panelarr/web/commit/6bedb02742f1fdb6014441957358e6f8ffba384a))
* **reader:** long strips read on from chapter to chapter ([647cb99](https://github.com/panelarr/web/commit/647cb99151d1ba75439e24422c34144a8cf82a31))
* **reader:** no seams between pages, and flings up keep going ([3f7b93f](https://github.com/panelarr/web/commit/3f7b93f923de6a0cc9bd9af28fc14d5dc577b433))
* **reader:** pages in a long strip keep their image, so nothing jumps ([c052bd1](https://github.com/panelarr/web/commit/c052bd13a79c3b7910d7ccdbbf5972f9036550fc))
* **reader:** say at once why a chapter didn't open, and lead back ([4ce796b](https://github.com/panelarr/web/commit/4ce796b3636a1300efcba033da31e7e6b39c17cb))
* **reader:** the chapter before is ready above before you scroll up to it ([6a8b95f](https://github.com/panelarr/web/commit/6a8b95f5bd74865fce4e575844136230781025dd))
* **reader:** the page being read stays put in a long strip ([daa764c](https://github.com/panelarr/web/commit/daa764c99efa545b3a1cf8f33d0656821aa927df))
* **shell:** no app header on phones, and no bands in the installed app ([4654cc3](https://github.com/panelarr/web/commit/4654cc31acd22ce408fb361a1b03e15d43722216))
* **ui:** line up form fields and keep dialog actions in view ([e56a72b](https://github.com/panelarr/web/commit/e56a72becd538090e5576ab6d1860c42d17a975e))
* **ui:** tab strips scroll only sideways ([6163280](https://github.com/panelarr/web/commit/6163280f781beadb0d9fde99e93829410ccce736))
* **works:** the attached series isn't a list item outside a list ([2271320](https://github.com/panelarr/web/commit/22713209828bc5708f14518f5a4e8781c272c6d7))
