# Changelog

## [1.2.0](https://github.com/Mathieu-COSYNS/passed/compare/v1.1.0...v1.2.0) (2026-09-17)


### Features

* display number of remaining views and expiry before and after opening a shared password ([3424244](https://github.com/Mathieu-COSYNS/passed/commit/3424244c0414dc650fb1d2b1e6b4f038d8a97a1f))
* put expiry and views inputs side by side on desktop ([b8a97ca](https://github.com/Mathieu-COSYNS/passed/commit/b8a97caae5e42599e3971de28fb7afb9e0f9d3bc))

## [1.1.0](https://github.com/Mathieu-COSYNS/passed/compare/v1.0.0...v1.1.0) (2026-09-15)


### Features

* add dutch translations ([a9efb06](https://github.com/Mathieu-COSYNS/passed/commit/a9efb06b6595af47b6aa2df9f35f1d49f0c29e2a))
* add enviroment variables that match vercel upstash-kv intergration ([d6629c3](https://github.com/Mathieu-COSYNS/passed/commit/d6629c371284a0e598ae02219c6baee8f8b117c2))
* add french translation ([66dcafb](https://github.com/Mathieu-COSYNS/passed/commit/66dcafbf7438850651f5f6faa9300359bf4ec84d))
* let sharers choose how many views a link allows ([7f7fad9](https://github.com/Mathieu-COSYNS/passed/commit/7f7fad99a5f48c87c6afcd2897c934371a15768a))
* select language based on browser's prefered languages ([a08b4f2](https://github.com/Mathieu-COSYNS/passed/commit/a08b4f2cd871156a7cfc83195a82f9ae42d23946))
* switch language with a native select and rework language js code ([c8cd7d0](https://github.com/Mathieu-COSYNS/passed/commit/c8cd7d0456c7000a64d7cbaa11febab09f91a3b6))


### Bug Fixes

* absorb share keys from the URL as soon as they appear ([9b17d40](https://github.com/Mathieu-COSYNS/passed/commit/9b17d40efd3b06f25bbd2341223ce5cbb42c4050))
* add language support for error messages related to empty passwords and invalid expiry ([539dbeb](https://github.com/Mathieu-COSYNS/passed/commit/539dbeb2ddace4d3d0d49cab7ff5721ddc195c9f))
* clear the compose field after a successful share ([17abb72](https://github.com/Mathieu-COSYNS/passed/commit/17abb726db005867a0f6640a0b4b0c406db50a3a))
* correct German translation typos ([1300aca](https://github.com/Mathieu-COSYNS/passed/commit/1300acaeb9eba942046a8f6c45314ef051d3b0a7))
* disable autocomplete on secret fields ([ca7f9da](https://github.com/Mathieu-COSYNS/passed/commit/ca7f9da72a0636d549270f89c2bcbbfa898f90ca))
* drop undefined msg from the password existence error ([be94992](https://github.com/Mathieu-COSYNS/passed/commit/be949925917b5eb9252d6ae296162af97a96a7bd))
* generate suggested passwords with a CSPRNG ([1af90c4](https://github.com/Mathieu-COSYNS/passed/commit/1af90c4fc10dee7ef918134fab8630f295d1a893))
* hide the copy button when clipboard is unavailable ([f869c0b](https://github.com/Mathieu-COSYNS/passed/commit/f869c0bd6b8fe3eb2d10265bc2ff420c6f3587d1))
* make generate password keyboard-accessible ([cfafa7d](https://github.com/Mathieu-COSYNS/passed/commit/cfafa7dc3a452116fa693ebfe7e6a764dbdc0966))
* make the revealed password field read-only ([a288276](https://github.com/Mathieu-COSYNS/passed/commit/a288276031f7357d9e6d6f77afe4ffa06af539ba))
* point Source link at this repository ([bbb8f1a](https://github.com/Mathieu-COSYNS/passed/commit/bbb8f1afce6d86e686fcffcb2987d4f348989fb5))
* reject empty passwords and distinguish capacity errors ([cb2fb02](https://github.com/Mathieu-COSYNS/passed/commit/cb2fb0222d2f42b06a1ad68d3d091eb458a3b812))
* reject malformed share fragments before they can burn a view ([c27da39](https://github.com/Mathieu-COSYNS/passed/commit/c27da39ec45cb3eecae11584704023bfe380a789))
* restore the share form when a share-link HEAD request fails ([f9be2ca](https://github.com/Mathieu-COSYNS/passed/commit/f9be2ca414a63f3660dcf28939c274a984528c35))
* set the revealed password via textarea value ([a1dc1f6](https://github.com/Mathieu-COSYNS/passed/commit/a1dc1f6c540e2a00d4cda4da1f89590981607a60))
* show not-found when a reveal GET returns 404 ([d08e128](https://github.com/Mathieu-COSYNS/passed/commit/d08e12896e7c27548a7529818ac043b907ac07df))
* use a 12-byte IV for AES-GCM ([793b4a4](https://github.com/Mathieu-COSYNS/passed/commit/793b4a4cdf4946f610be0bf8a31e55d8b34ff329))
