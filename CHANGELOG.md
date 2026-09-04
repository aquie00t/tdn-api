# [1.18.0](https://github.com/the-developer-network/tdn-api/compare/v1.17.0...v1.18.0) (2026-09-04)


### Bug Fixes

* **test:** send the refresh cookie the way the endpoint reads it ([#262](https://github.com/the-developer-network/tdn-api/issues/262)) ([6b441ea](https://github.com/the-developer-network/tdn-api/commit/6b441eaad94f99a00f91d4c65655a4fb4840b2b3))


### Features

* **auth:** suspend accounts with bannedAt ([#260](https://github.com/the-developer-network/tdn-api/issues/260)) ([0c91238](https://github.com/the-developer-network/tdn-api/commit/0c91238dfed8572214e36ca399c90349dc35f5c5))
* **digest:** send a daily digest email ([#261](https://github.com/the-developer-network/tdn-api/issues/261)) ([91874cd](https://github.com/the-developer-network/tdn-api/commit/91874cd2cc94b8e4affe4162de063c9c2d8cc8e6))

# [1.17.0](https://github.com/the-developer-network/tdn-api/compare/v1.16.0...v1.17.0) (2026-09-04)


### Features

* **mentions:** resolve [@handles](https://github.com/handles) and notify the people named ([#259](https://github.com/the-developer-network/tdn-api/issues/259)) ([de2b99b](https://github.com/the-developer-network/tdn-api/commit/de2b99bc1c2a2fd1656011b9117c17491efa1a50))

# [1.16.0](https://github.com/the-developer-network/tdn-api/compare/v1.15.0...v1.16.0) (2026-09-03)


### Features

* **chat:** add one-to-one direct messaging ([#257](https://github.com/the-developer-network/tdn-api/issues/257)) ([b4e8b00](https://github.com/the-developer-network/tdn-api/commit/b4e8b003fa7abdd1640cd5a9a6f23385efb42ddd))

# [1.15.0](https://github.com/the-developer-network/tdn-api/compare/v1.14.1...v1.15.0) (2026-09-01)


### Features

* **media:** moderate every uploaded image and video ([#253](https://github.com/the-developer-network/tdn-api/issues/253)) ([7d42386](https://github.com/the-developer-network/tdn-api/commit/7d423869309b6d0e1a9aa0a1f4b1380c4479c438))

## [1.14.1](https://github.com/the-developer-network/tdn-api/compare/v1.14.0...v1.14.1) (2026-09-01)


### Bug Fixes

* **post:** stop the feed ending where the ranked window does ([#251](https://github.com/the-developer-network/tdn-api/issues/251)) ([86e19e4](https://github.com/the-developer-network/tdn-api/commit/86e19e451f4cdacb8df63bedd225e6cac7dc6032))

# [1.14.0](https://github.com/the-developer-network/tdn-api/compare/v1.13.0...v1.14.0) (2026-09-01)


### Features

* **post:** rank the feed by language, interest and freshness ([#250](https://github.com/the-developer-network/tdn-api/issues/250)) ([8541ac8](https://github.com/the-developer-network/tdn-api/commit/8541ac8a4da3842bb64fa8a104c97bbe7f2fe6ad))

# [1.13.0](https://github.com/the-developer-network/tdn-api/compare/v1.12.3...v1.13.0) (2026-08-31)


### Features

* **post:** list a post's quotes and allow a quote with no text ([#242](https://github.com/the-developer-network/tdn-api/issues/242)) ([faa97c7](https://github.com/the-developer-network/tdn-api/commit/faa97c7eec9d00dcd85c77cf4e5a517cf1aad74f))

## [1.12.3](https://github.com/the-developer-network/tdn-api/compare/v1.12.2...v1.12.3) (2026-08-30)


### Bug Fixes

* **article:** match the tag filter case-insensitively ([#238](https://github.com/the-developer-network/tdn-api/issues/238)) ([8acad07](https://github.com/the-developer-network/tdn-api/commit/8acad073eaae4f9827cd5bc30e027782def95ab6))

## [1.12.2](https://github.com/the-developer-network/tdn-api/compare/v1.12.1...v1.12.2) (2026-08-28)


### Bug Fixes

* **post:** stop randomising cached news feeds ([#237](https://github.com/the-developer-network/tdn-api/issues/237)) ([7f1b945](https://github.com/the-developer-network/tdn-api/commit/7f1b945704fa264044064e8d5d5a9004aef05ff2))

## [1.12.1](https://github.com/the-developer-network/tdn-api/compare/v1.12.0...v1.12.1) (2026-08-28)


### Bug Fixes

* **http:** name the enum values in response schemas instead of "string" ([#236](https://github.com/the-developer-network/tdn-api/issues/236)) ([f24665f](https://github.com/the-developer-network/tdn-api/commit/f24665f9d86b33a2086a819f10335b993a53322d))

# [1.12.0](https://github.com/the-developer-network/tdn-api/compare/v1.11.2...v1.12.0) (2026-08-28)


### Features

* **notification:** notify followers when a bot publishes a post ([#234](https://github.com/the-developer-network/tdn-api/issues/234)) ([772d00f](https://github.com/the-developer-network/tdn-api/commit/772d00fa0eb55c750497cf3610db2b53e4ba83f9))

## [1.11.2](https://github.com/the-developer-network/tdn-api/compare/v1.11.1...v1.11.2) (2026-08-28)


### Bug Fixes

* **http:** declare author username required, as the database already guarantees ([#233](https://github.com/the-developer-network/tdn-api/issues/233)) ([541b484](https://github.com/the-developer-network/tdn-api/commit/541b484eb936f3d25b913994f8809dc42fcfb879)), closes [tdn-client#121](https://github.com/tdn-client/issues/121)

## [1.11.1](https://github.com/the-developer-network/tdn-api/compare/v1.11.0...v1.11.1) (2026-08-28)


### Bug Fixes

* **profile:** list only categorised bots, and add the category assignment script ([#232](https://github.com/the-developer-network/tdn-api/issues/232)) ([2bf382c](https://github.com/the-developer-network/tdn-api/commit/2bf382c3f2507973b389b139f7cca53c9ee08ce3))

# [1.11.0](https://github.com/the-developer-network/tdn-api/compare/v1.10.0...v1.11.0) (2026-08-28)


### Features

* **profile:** add bot-only categories and category-filtered bot discovery ([#231](https://github.com/the-developer-network/tdn-api/issues/231)) ([0f7ebf9](https://github.com/the-developer-network/tdn-api/commit/0f7ebf92e1d736a97483e5da2f8b36b7a24d8f58))

# [1.10.0](https://github.com/the-developer-network/tdn-api/compare/v1.9.2...v1.10.0) (2026-08-27)


### Bug Fixes

* **follow:** let the database settle concurrent follows ([#229](https://github.com/the-developer-network/tdn-api/issues/229)) ([3d90107](https://github.com/the-developer-network/tdn-api/commit/3d90107982d591aa21b7c21f61f20200c99c57ae))


### Features

* **follow:** move follow and unfollow to the STANDARD rate limit ([#228](https://github.com/the-developer-network/tdn-api/issues/228)) ([62b1697](https://github.com/the-developer-network/tdn-api/commit/62b1697758515895201a4b7e6e384e1279c33069))

## [1.9.2](https://github.com/the-developer-network/tdn-api/compare/v1.9.1...v1.9.2) (2026-08-27)


### Bug Fixes

* **http:** answer rate limits and known Prisma failures as problem documents ([#227](https://github.com/the-developer-network/tdn-api/issues/227)) ([21d2713](https://github.com/the-developer-network/tdn-api/commit/21d271368418c36d998b9382263ae3d19a00c574))

## [1.9.1](https://github.com/the-developer-network/tdn-api/compare/v1.9.0...v1.9.1) (2026-08-27)


### Bug Fixes

* **notification:** take the notification back when its action is undone ([#226](https://github.com/the-developer-network/tdn-api/issues/226)) ([f8e4138](https://github.com/the-developer-network/tdn-api/commit/f8e4138b63b2f0bec55a7f0407a98a77128be4c5))

# [1.9.0](https://github.com/the-developer-network/tdn-api/compare/v1.8.0...v1.9.0) (2026-08-27)


### Features

* **notification:** add unread count and per-notification read ([#223](https://github.com/the-developer-network/tdn-api/issues/223)) ([fbd4b22](https://github.com/the-developer-network/tdn-api/commit/fbd4b2263db2ea18626d3733b4ad04ccd06d293e))

# [1.8.0](https://github.com/the-developer-network/tdn-api/compare/v1.7.4...v1.8.0) (2026-08-26)


### Features

* **notification:** carry the whole deep-link target on every notification ([#221](https://github.com/the-developer-network/tdn-api/issues/221)) ([de8fbe3](https://github.com/the-developer-network/tdn-api/commit/de8fbe3a6e3a61ca96cd7b65fcca8844eeef9bce))

## [1.7.4](https://github.com/the-developer-network/tdn-api/compare/v1.7.3...v1.7.4) (2026-08-26)


### Bug Fixes

* **profile:** stop deleting the shared default banner on upload ([#220](https://github.com/the-developer-network/tdn-api/issues/220)) ([e41f272](https://github.com/the-developer-network/tdn-api/commit/e41f2720c6c77bd3b4bc878ef4d0d3ec8935c117))

## [1.7.3](https://github.com/the-developer-network/tdn-api/compare/v1.7.2...v1.7.3) (2026-08-26)


### Bug Fixes

* **bookmark:** include bookmarked articles in the saved list ([#219](https://github.com/the-developer-network/tdn-api/issues/219)) ([e6f8550](https://github.com/the-developer-network/tdn-api/commit/e6f85506ee9eff409f03073563713ef0470a8b02))

## [1.7.2](https://github.com/the-developer-network/tdn-api/compare/v1.7.1...v1.7.2) (2026-08-26)


### Bug Fixes

* **build:** point tsc-alias at tsconfig.build.json ([#218](https://github.com/the-developer-network/tdn-api/issues/218)) ([3c11315](https://github.com/the-developer-network/tdn-api/commit/3c113157b5cf56c7a790bbb131853ac8e48dd119))

## [1.7.1](https://github.com/the-developer-network/tdn-api/compare/v1.7.0...v1.7.1) (2026-08-25)


### Bug Fixes

* **article:** reject cover uploads carrying more than one file ([#216](https://github.com/the-developer-network/tdn-api/issues/216)) ([2eaeb15](https://github.com/the-developer-network/tdn-api/commit/2eaeb15ac391919b9f16981a523a57dfc512be0c))
* **test:** repair the unterminated string in the cover upload suite ([#217](https://github.com/the-developer-network/tdn-api/issues/217)) ([e4655ab](https://github.com/the-developer-network/tdn-api/commit/e4655ab98fb0b673b5db986fd64ed8b7f051089a)), closes [#216](https://github.com/the-developer-network/tdn-api/issues/216)

# [1.7.0](https://github.com/the-developer-network/tdn-api/compare/v1.6.0...v1.7.0) (2026-08-25)


### Features

* **article:** drop the markdown body from list responses ([#213](https://github.com/the-developer-network/tdn-api/issues/213)) ([628d897](https://github.com/the-developer-network/tdn-api/commit/628d897b13134a4040e7ae7624953661df31f569))
* **profile:** expose published articleCount on the profile response ([#214](https://github.com/the-developer-network/tdn-api/issues/214)) ([1b030bf](https://github.com/the-developer-network/tdn-api/commit/1b030bf95b89604187df3c65b34ea27e663c9cf9))


### Performance Improvements

* **profile:** resolve follower list targets without loading the full profile ([#215](https://github.com/the-developer-network/tdn-api/issues/215)) ([b855269](https://github.com/the-developer-network/tdn-api/commit/b8552692844d8fe191d7c3f9f81ef514d0343277))

# [1.6.0](https://github.com/the-developer-network/tdn-api/compare/v1.5.0...v1.6.0) (2026-08-25)


### Features

* **article:** add likes, bookmarks and tag integration ([#212](https://github.com/the-developer-network/tdn-api/issues/212)) ([bcf06bd](https://github.com/the-developer-network/tdn-api/commit/bcf06bd7254be427320dfcdecafddd6563931548))

# [1.5.0](https://github.com/the-developer-network/tdn-api/compare/v1.4.0...v1.5.0) (2026-08-25)


### Features

* **article:** add comments on articles ([#211](https://github.com/the-developer-network/tdn-api/issues/211)) ([da44a3b](https://github.com/the-developer-network/tdn-api/commit/da44a3b08ae041a8851a068b28aabc7f86168691))

# [1.4.0](https://github.com/the-developer-network/tdn-api/compare/v1.3.0...v1.4.0) (2026-08-24)


### Features

* **article:** add cover image upload ([#209](https://github.com/the-developer-network/tdn-api/issues/209)) ([91de09a](https://github.com/the-developer-network/tdn-api/commit/91de09a071b18141596331ab34d6e8f37df50e1a))

# [1.3.0](https://github.com/the-developer-network/tdn-api/compare/v1.2.0...v1.3.0) (2026-08-24)


### Features

* **article:** add the article read path ([#208](https://github.com/the-developer-network/tdn-api/issues/208)) ([56fc950](https://github.com/the-developer-network/tdn-api/commit/56fc95007a98f9fc87e5b1175fe5a580eed83896))

# [1.2.0](https://github.com/the-developer-network/tdn-api/compare/v1.1.0...v1.2.0) (2026-08-24)


### Features

* **article:** add the article write path ([#207](https://github.com/the-developer-network/tdn-api/issues/207)) ([5802945](https://github.com/the-developer-network/tdn-api/commit/58029459c2271a383c7934be84dbbb9c2e056c56))

# [1.1.0](https://github.com/the-developer-network/tdn-api/compare/v1.0.5...v1.1.0) (2026-08-24)


### Bug Fixes

* **db:** restore foreign keys that were never created ([#206](https://github.com/the-developer-network/tdn-api/issues/206)) ([3f185a3](https://github.com/the-developer-network/tdn-api/commit/3f185a30ef4a2693f7e817f133880bc9eb7e74b1))


### Features

* **article:** add Article schema, domain entity and repository ([#205](https://github.com/the-developer-network/tdn-api/issues/205)) ([99dbb2c](https://github.com/the-developer-network/tdn-api/commit/99dbb2c7b35ed7292fa72011316a044b4501d7b6))

## [1.0.5](https://github.com/the-developer-network/tdn-api/compare/v1.0.4...v1.0.5) (2026-08-24)


### Bug Fixes

* **deps:** bump @fastify/swagger-ui to 6.x for the @fastify/static advisory ([#204](https://github.com/the-developer-network/tdn-api/issues/204)) ([60a05d2](https://github.com/the-developer-network/tdn-api/commit/60a05d2d1334d544d9b816ff1150231a77ef45ba))

## [1.0.4](https://github.com/the-developer-network/tdn-api/compare/v1.0.3...v1.0.4) (2026-08-24)


### Bug Fixes

* **deps:** override deepmerge-ts to a patched version ([#203](https://github.com/the-developer-network/tdn-api/issues/203)) ([5abad44](https://github.com/the-developer-network/tdn-api/commit/5abad44b0f40e4445454cf03c725b8591ec60db7))

## [1.0.3](https://github.com/the-developer-network/tdn-api/compare/v1.0.2...v1.0.3) (2026-08-24)


### Bug Fixes

* **deps:** raise lodash override above GHSA-r5fr-rjxr-66jc ([#198](https://github.com/the-developer-network/tdn-api/issues/198)) ([ade9307](https://github.com/the-developer-network/tdn-api/commit/ade93076b14ae550d7efec061c813a1bf2e23cb0)), closes [#187](https://github.com/the-developer-network/tdn-api/issues/187)

## [1.0.2](https://github.com/the-developer-network/tdn-api/compare/v1.0.1...v1.0.2) (2026-08-24)


### Bug Fixes

* **deps:** apply pnpm overrides via pnpm-workspace.yaml ([#184](https://github.com/the-developer-network/tdn-api/issues/184)) ([cd9ef14](https://github.com/the-developer-network/tdn-api/commit/cd9ef148ec8bf7f0f50f0fb3b2036c80bc824e2b)), closes [#154](https://github.com/the-developer-network/tdn-api/issues/154) [#155](https://github.com/the-developer-network/tdn-api/issues/155)

## [1.0.1](https://github.com/the-developer-network/tdn-api/compare/v1.0.0...v1.0.1) (2026-05-18)


### Bug Fixes

* **ci:** resolve corepack exit code 127 on node:26-alpine ([#144](https://github.com/the-developer-network/tdn-api/issues/144)) ([01ac86e](https://github.com/the-developer-network/tdn-api/commit/01ac86e0f8a858a39a59ea2b34d23b3294dbb69f))

# 1.0.0 (2026-05-16)


### Bug Fixes

* **api:** add optional auth to feed route to resolve isLiked state ([cf24e04](https://github.com/the-developer-network/tdn-api/commit/cf24e042075f1c3c578cc4661135c95c1cdb6e48))
* **api:** map getBookmarks response to prevent raw entity leak ([cf14e76](https://github.com/the-developer-network/tdn-api/commit/cf14e76341c4db5ddbee5a308b09625c1f9f8607))
* **app:** fix typos and correct import/naming inconsistencies ([fbf3dc0](https://github.com/the-developer-network/tdn-api/commit/fbf3dc0e62499f59634e1b4dd3137237b890e5ab))
* **auth:** accept refreshToken from body as fallback to cookie ([c7b5e07](https://github.com/the-developer-network/tdn-api/commit/c7b5e0798411b3e7237e54f50b3768de9140f548))
* **auth:** bind recoverAccount controller method to preserve this context ([36a9b23](https://github.com/the-developer-network/tdn-api/commit/36a9b23c7163a0705e40dfbf3e1ed4bd6a08ac3e))
* **auth:** fix refresh token cookie for cross-subdomain requests- Set sameSite to 'none' in production to allow cross-origin cookie sending- Set domain to '.developernetwork.net' to share cookie across subdomains- Keep strict sameSite in development for security ([4b11afa](https://github.com/the-developer-network/tdn-api/commit/4b11afa9de4f916df64c84b2d5b6700ee64d564a))
* **auth:** update cookie policies and enable trust proxy ([ec1c0a3](https://github.com/the-developer-network/tdn-api/commit/ec1c0a31d33992d30438e74015fb8316f9e33a6a))
* **auth:** use dedicated RefreshResponseSchema to fix 500 on valid refresh token ([fe78883](https://github.com/the-developer-network/tdn-api/commit/fe78883127fe9a73fbcda3d439d0cfa33388e02b))
* **bookmarks:** invalidate feed cache on save/unsave operations ([5eb4805](https://github.com/the-developer-network/tdn-api/commit/5eb4805e1251555c47723d6269295939245a2547))
* ci ([fcc5b7a](https://github.com/the-developer-network/tdn-api/commit/fcc5b7a57a80d4e4250032ea319f780d7551257a))
* ci ([dcd45ed](https://github.com/the-developer-network/tdn-api/commit/dcd45ed2bf8bbd23061917ed79fef3adf9a78ff3))
* **ci:** restrict GITHUB_TOKEN permissions to read-only ([47a7df7](https://github.com/the-developer-network/tdn-api/commit/47a7df7ffae02c097c687b40a498a42fca254ef2))
* **ci:** upgrade actions to v6 and set Node version to 24 for pnpm cache compatibility ([2f87306](https://github.com/the-developer-network/tdn-api/commit/2f87306c4eb8c2e4631b07be32545dadc1d896bf))
* **comment:** add fullName and isMe to comment author response ([3900f8b](https://github.com/the-developer-network/tdn-api/commit/3900f8b11918173d68b28a7fe2e3114158e8e5fd))
* **comment:** correctly map fullName in comment responses- Map fullName from author.profile in toDomainComment- Remove hardcoded fullName fallback in toResponse- Pass currentUserId to toListResponse in getPostComments- Add fullName to findTopLevelByPostId profile select ([ced79ce](https://github.com/the-developer-network/tdn-api/commit/ced79ce81c7eb6ed784e87e3d2ee2080c253d34f))
* **comment:** update delete usecase to use unit of work transaction ([5c4d13d](https://github.com/the-developer-network/tdn-api/commit/5c4d13d4fa8ebd9685f74531341b3195e6ae1aaf))
* **config:** update CORS plugin to support multiple origins and credentials ([17ebc0a](https://github.com/the-developer-network/tdn-api/commit/17ebc0a2a96466c56dc8588e8b6653f90c613c62))
* **core:** relocate missing entities to domain, resolve type mismatches and implement data mappers ([ece5a5d](https://github.com/the-developer-network/tdn-api/commit/ece5a5da85607421f53b53ba0f01ff9b9106e9e4))
* delete auto-merge.yml ([778061e](https://github.com/the-developer-network/tdn-api/commit/778061e63b97cd540a13acf59a4ba4114c86f5b3))
* **di:** resolve awilix injection error for post use cases ([eb4d1d5](https://github.com/the-developer-network/tdn-api/commit/eb4d1d56b81cace252c2c5607def109674f1fe1a))
* **docker:** add --ignore-scripts to prevent lifecycle errors in production build ([ed060b3](https://github.com/the-developer-network/tdn-api/commit/ed060b350743c16f0510606ae4e3897991b6ed3d))
* **docker:** copy patches/ folder to runner stage for pnpm patchedDependencies ([5b7bb7b](https://github.com/the-developer-network/tdn-api/commit/5b7bb7b1907b36a7ab2046c1555c9ab69dad3258))
* **docker:** copy patches/ to build stage before pnpm install ([a3443e5](https://github.com/the-developer-network/tdn-api/commit/a3443e51971df575c32e58e4c6b15769c36e7d4a))
* **docker:** disable husky during build and add alpine build tools for argon2 ([36a59b3](https://github.com/the-developer-network/tdn-api/commit/36a59b34ba4162270def212e2a071059dcad3127))
* **docker:** remove non-existent .prisma copy in runner stage ([f788713](https://github.com/the-developer-network/tdn-api/commit/f7887130bffa134fc632da0449909a9fcf73f12a))
* **docker:** resolve pnpm symlink issue by running prisma generate directly in runner stage ([bda7c2c](https://github.com/the-developer-network/tdn-api/commit/bda7c2cfa3a506576f556587f7c01c5470f7dc09))
* **domain:** simplify entity factory methods and delegate ID/Date generation to DB ([470d224](https://github.com/the-developer-network/tdn-api/commit/470d224610ec16beaf539ab1e61f9c0d05a39076))
* **http:** resolve serialization error and align schemas with response wrapper ([e2c70ec](https://github.com/the-developer-network/tdn-api/commit/e2c70ec3fbdafaa9f20e3dee634796d151457f01))
* login response github, google, recovery update ([8138be9](https://github.com/the-developer-network/tdn-api/commit/8138be983e9e561e0d3f76b25b45a6259bbc1b5e))
* **mapper:** resolve fullName null/undefined type mismatch in PostPrismaMapper ([4a50fb0](https://github.com/the-developer-network/tdn-api/commit/4a50fb05e87ad335d55fcf4a304378e6b16d3fa2))
* **mappers:** add ?v=1 cache-bust param for default avatar in post and comment responses ([438c74f](https://github.com/the-developer-network/tdn-api/commit/438c74f0525a551bab5bf25298ac2b12a67dc55e))
* **mappers:** resolve bugs and enforce consistency across all mappers ([#128](https://github.com/the-developer-network/tdn-api/issues/128)) ([35241e9](https://github.com/the-developer-network/tdn-api/commit/35241e91f5064b5b7285833f6d3bca54ff4a21b2))
* **notification:** add missing issuerId and referenceId to mapper output ([9512a4b](https://github.com/the-developer-network/tdn-api/commit/9512a4b0932f984a01808badfc3da018c0a10b60))
* **notification:** correct repository interface export name in follow-user usecase ([42fa40d](https://github.com/the-developer-network/tdn-api/commit/42fa40df3daed3e0fa9052287f04dcf9f98bb586))
* **notification:** resolve avatarUrl CDN URL in GET /notifications response ([dc6fc85](https://github.com/the-developer-network/tdn-api/commit/dc6fc85599dd1dfb068efb791a136dfddb9bcde6))
* **oauth:** handle AccountPendingDeletionError in OAuth callbacks ([0c92e49](https://github.com/the-developer-network/tdn-api/commit/0c92e4998aa5a10bcc67a35e3f6ff12a398202e6))
* **oauth:** pass refresh token via url to bypass 302 cookie drop ([73843f0](https://github.com/the-developer-network/tdn-api/commit/73843f0b02d8e9607fba509df7551b2f96fc2b76))
* **oauth:** redirect to oauth-success on AccountPendingDeletionError- Fix GitHub and Google callbacks to redirect to /oauth-success  with error and recoveryToken query params instead of /recover-account- Extract frontendUrl as private getter to eliminate duplication ([9efba41](https://github.com/the-developer-network/tdn-api/commit/9efba41dbc21bbcc08569730c0c3a8e29d1c4771))
* **oauth:** sanitize GitHub username in GithubAuthService ([f5479de](https://github.com/the-developer-network/tdn-api/commit/f5479de2d34707b1a258960c950b09239c9bb2e6)), closes [#68](https://github.com/the-developer-network/tdn-api/issues/68)
* **oauth:** sanitize GitHub username in GithubAuthService ([1c2edc3](https://github.com/the-developer-network/tdn-api/commit/1c2edc374f1c3f7d871c935495daa0c7aae828ad))
* override effect to 3.20.0 to resolve security vulnerability ([79dbfde](https://github.com/the-developer-network/tdn-api/commit/79dbfdea8d0c5b3b193b3683938f857936ff85f8))
* **post:** add optional auth to post detail route and fix mapper ([687b5d6](https://github.com/the-developer-network/tdn-api/commit/687b5d692225a322a8262b97c72f8bbe7b47b121))
* **post:** map fullName from profile relation in toDomainPost- Add fullName to PostWithRelations Prisma type select- Map fullName from author.profile in toDomainPost mapper- Add isMe and fullName fields to PostProps author interface ([509e4a1](https://github.com/the-developer-network/tdn-api/commit/509e4a19031f4179a10ad59485968536c67cad3e))
* **post:** pass userId to mapper to resolve missing like/bookmark status- Add missing `userId` parameter to `PostPrismaMapper.toResponse` in `getPost` controller method- This ensures `isLiked` and `isBookmarked` fields are correctly populated when fetching a single post detail ([ceb50ed](https://github.com/the-developer-network/tdn-api/commit/ceb50edeb2bdfa99a252d67fba10e65c0e4924d4))
* **post:** return full post response on create instead of only id ([8864aaf](https://github.com/the-developer-network/tdn-api/commit/8864aaff7d7b943f6a2de416cc5f27687d3abd98))
* **profile:** prevent default asset deletion and add cache-bust param ([f644ba6](https://github.com/the-developer-network/tdn-api/commit/f644ba6efb6c8fbaf55c7267bb77d9c71b659110))
* **profiles:** resolve 500 error on search endpoint ([74dea78](https://github.com/the-developer-network/tdn-api/commit/74dea780f40f1b7738e786cbf51cfaa82f0c189e))
* **repository:** add fullName to profile select in post queries ([b434679](https://github.com/the-developer-network/tdn-api/commit/b434679c893cb6a7c92a208c177d0225b92a0043))
* resolve broken pnpm lockfile ([9cc1031](https://github.com/the-developer-network/tdn-api/commit/9cc10313dd8ba96ed6771630fb9c0a199e7303e3))
* resolve hardcoded frontend redirect URL in auth controller ([ad9fa3c](https://github.com/the-developer-network/tdn-api/commit/ad9fa3cddbc89792917a8a0bb8ccb89e8e0af2c0))
* resolve merge conflicts ([18ecc00](https://github.com/the-developer-network/tdn-api/commit/18ecc00038a5e62de7528df0bc2847eeccbe7106))
* **security:** harden realtime and security service implementations ([#130](https://github.com/the-developer-network/tdn-api/issues/130)) ([2257cfe](https://github.com/the-developer-network/tdn-api/commit/2257cfed7ef4c103a07d1876d983165108538810))
* **security:** patch fast-jwt GHSA-mvf2-f6gm-w987 via pnpm patch ([90f2fb6](https://github.com/the-developer-network/tdn-api/commit/90f2fb6f9677a37f1101274e60760372c4bef6cd))
* **tag:** fix findTrending sort order using windowed post count ([#94](https://github.com/the-developer-network/tdn-api/issues/94)) ([7a11410](https://github.com/the-developer-network/tdn-api/commit/7a11410323f233c3c1bfd819255b58467b88ffd6))
* **test:** Excepted: Community to Received: Tecnology ([d38feeb](https://github.com/the-developer-network/tdn-api/commit/d38feebcabd023f81f35a7a097a08253ceb00aa5))
* **tests:** correct imports and remove Fastify 'ignoreSlash' option ([26640af](https://github.com/the-developer-network/tdn-api/commit/26640af25786a8777bd0edb1fb88dcb9c72e24ed))
* **tests:** correct imports and remove Fastify 'ignoreSlash' option ([#63](https://github.com/the-developer-network/tdn-api/issues/63)) ([faf9cce](https://github.com/the-developer-network/tdn-api/commit/faf9cce07ffa26d160f1c70d67fcb20afc2be127))
* translate email service messages from Turkish to English ([9499df5](https://github.com/the-developer-network/tdn-api/commit/9499df55e0cc77735a7f1a079bf36b0d6c204d60))
* **tsconfig:** make paths relative and remove baseUrl to fix TS5090 ([a4bfe9b](https://github.com/the-developer-network/tdn-api/commit/a4bfe9bf47bbda21dbf1521e4773d7d2095514cf))
* unit tests ([15e5965](https://github.com/the-developer-network/tdn-api/commit/15e5965fb92f92221192c8544d49c532e084343e))
* **user:** wrap getMe response in data/meta envelope ([5287022](https://github.com/the-developer-network/tdn-api/commit/5287022e36fa5e8ac20cc521640504629b8c34de))


### Features

* add /auth/check endpoint ([176cf0f](https://github.com/the-developer-network/tdn-api/commit/176cf0f81c357f204ccb8a3b3369577628be905f))
* add DeepL translation endpoint (POST /api/v1/translate) ([15727ea](https://github.com/the-developer-network/tdn-api/commit/15727ea4a62a2c034b3868848ace3e79a9b45c32))
* add global error handler with RFC 7807 standards ([12f2d7f](https://github.com/the-developer-network/tdn-api/commit/12f2d7fda8c65a00bc31ae0a104926ffdfcebc4f))
* **api:** add followedOnly filter to getPosts endpoint ([20bcfbf](https://github.com/the-developer-network/tdn-api/commit/20bcfbf915ea25982d35ee8a69efe40af40f224f))
* **api:** improve frontend compatibility for profile, posts, and follow endpoints ([3015de0](https://github.com/the-developer-network/tdn-api/commit/3015de071472785ac680605c379db7a478b85db5))
* **auth:** add refresh token cleanup scheduler with clean architecture flow ([9a6a0ae](https://github.com/the-developer-network/tdn-api/commit/9a6a0ae18dd6ffca51ac4dcb7bcd0903a21b861a))
* **auth:** implement account deletion flow and recovery mechanism ([4788f06](https://github.com/the-developer-network/tdn-api/commit/4788f0652830b0431213687dbb926a8ca680f45f))
* **auth:** implement automatic email verification for oauth and add jsdoc to ports ([69d8751](https://github.com/the-developer-network/tdn-api/commit/69d8751c0172b46b5b7c81a6cc6677c57c0e6268))
* **auth:** implement email verification with 8-digit OTP ([34c6862](https://github.com/the-developer-network/tdn-api/commit/34c6862c694ab2c91c509b2c7d2a60bf1e27415b))
* **auth:** implement github oauth integration and refactor controllers- Prisma: Add 'OAuthAccount' model, make user password optional, and implement 'createWithOAuth' transaction.- Core: Create 'GithubLoginUseCase' featuring auto-suffix for username collisions and soft-delete recovery.- Infra: Implement 'GithubAuthService' for token exchange and unify crypto operations in 'CryptoService'.- HTTP: Extract 'BaseAuthController' for DRY cookie management.- HTTP: Create 'OAuthController' and register '/api/v1/oauth' routes.- DI: Register new OAuth ports, services, and use cases in Awilix container. ([1488af7](https://github.com/the-developer-network/tdn-api/commit/1488af71112a6ccc9ee8a504706af9a775fbc14f))
* **auth:** implement google oauth and secure recovery session ([05aee32](https://github.com/the-developer-network/tdn-api/commit/05aee320a8827fd854d72564e23a54d9c57a70fc))
* **auth:** implement login flow and jwt authentication ([b7a60ef](https://github.com/the-developer-network/tdn-api/commit/b7a60ef983d50478cd2412ed1b0bee060f3e3242))
* **auth:** implement opaque refresh tokens via http-only cookies ([0828652](https://github.com/the-developer-network/tdn-api/commit/08286520b405710e9a1311121ec56bb313387e4d))
* **auth:** implement secure logout and refactor use cases ([e9cf29e](https://github.com/the-developer-network/tdn-api/commit/e9cf29e98e8cfe362ee16282dd2e25a87e0c040a))
* **auth:** implement secure password reset flow, ([6c1b46e](https://github.com/the-developer-network/tdn-api/commit/6c1b46e68df016a39bca127c078b0c481949e9de))
* **auth:** implement secure refresh token rotation flow ([eddeb56](https://github.com/the-developer-network/tdn-api/commit/eddeb560c2e6f69b1adc00b01525cfd7324e64fc))
* **auth:** login response add data isEmailVerified ([60d9dcc](https://github.com/the-developer-network/tdn-api/commit/60d9dcc243bf61068ec0a75b5ee9bbfbebcc03f0))
* **auth:** refactor token services and implement rate limiting ([396cef3](https://github.com/the-developer-network/tdn-api/commit/396cef36e233e1ec52ceba9dc5a0328045eae08b))
* **auth:** secure refresh tokens with SHA-256 hashing format ([88754a2](https://github.com/the-developer-network/tdn-api/commit/88754a29b5602df1c1c5cc0d6832e2c95e1ef886))
* **bookmark:** add save/remove comment bookmark use-cases and extend GetBookmarks with comments ([3531215](https://github.com/the-developer-network/tdn-api/commit/3531215fe63a128f477e618cd190eac3de05baa7))
* **bookmark:** implement post bookmarking system ([804c334](https://github.com/the-developer-network/tdn-api/commit/804c334bcbe18c64b7dcdf3ce745e8e7e82b8a6c))
* **bots:** add Bot token support and rate-limit allowList ([#70](https://github.com/the-developer-network/tdn-api/issues/70)) ([672b8a7](https://github.com/the-developer-network/tdn-api/commit/672b8a7762864022b3698faa7bccb2399727a1bc))
* **comment:** add isBookmarked to domain, mapper, repositories and new CommentBookmark repo ([6e1c451](https://github.com/the-developer-network/tdn-api/commit/6e1c451787d17433e95e6f8b460b8eee51b96e62))
* **comment:** add media support to comments- Update Prisma schema with `mediaUrls` array field for the Comment model- Update Comment domain entity, use case input, and mapper to handle media URLs- Update Fastify validation schema to accept up to 4 media URLs per comment- Update repository and controller to process and persist comment media- Update E2E tests to include media URL payload in comment creation ([7744f85](https://github.com/the-developer-network/tdn-api/commit/7744f8582ab59e1906391c73b30d703aaf0a1c52))
* **comment:** add nested comment counter cache and reply endpoints ([94ffae3](https://github.com/the-developer-network/tdn-api/commit/94ffae3340cc66521f50e59e3b3f5152ca56a09e))
* **comment:** complete comment creation flow with atomic counters- Integrated commentCount into Post entity, repository, and mappers.- Fixed UI/API visibility by mapping physical commentCount field.- Verified end-to-end creation and notification flow with automated scripts. ([275c716](https://github.com/the-developer-network/tdn-api/commit/275c7169abf9165d75337d235daae7426f9ef292))
* **comment:** implement comment like and unlike functionality ([c1b3924](https://github.com/the-developer-network/tdn-api/commit/c1b3924f00d74866efc89fc25372410b6c7dc01f))
* **comment:** implement paginated post comments retrieval ([348e0aa](https://github.com/the-developer-network/tdn-api/commit/348e0aadc46d06744a2ba183d18d9bdcc5035683))
* **core:** add TransactionPort and TransactionContext for atomic operations ([293fef1](https://github.com/the-developer-network/tdn-api/commit/293fef1b274729f3233ebac9f4bdf3f0e4615284))
* **email:** migrate from SMTP to Resend SDK for production readiness ([fe82e3e](https://github.com/the-developer-network/tdn-api/commit/fe82e3ee9bf5246f6872146edece549a0981fd47))
* **follow:** implement follow and unfollow user functionality with separated domain architecture ([3acfea3](https://github.com/the-developer-network/tdn-api/commit/3acfea387164e3d298c37123af51b8cc6577fa53))
* GET post details ([60ba67c](https://github.com/the-developer-network/tdn-api/commit/60ba67ce125833ac82d088362bad25f5ba297250))
* **http:** add optionalAuthenticate decorator, comment bookmark routes and fix getBookmarks isBookmarked bug ([4174bc8](https://github.com/the-developer-network/tdn-api/commit/4174bc8e2d85b4fd383faa4879057f748cec5d81))
* **http:** implement global jwt auth guard ([e35e000](https://github.com/the-developer-network/tdn-api/commit/e35e0003b422153470b4b1b898be557b41e018dc))
* implement preSerialization hook to wrap successful responses ([0e1e434](https://github.com/the-developer-network/tdn-api/commit/0e1e43435b20e86b24fb2d0325d9a5caff921841))
* **notification:** implement paginated get notifications endpoint with typebox and mapper ([178c2da](https://github.com/the-developer-network/tdn-api/commit/178c2da2946404d57f5eae33dfa1a75b79dda500))
* **notification:** implement retention limits and automated purge cron job ([3275b04](https://github.com/the-developer-network/tdn-api/commit/3275b043d78fae53b0f5b237d6111a927fc45ea2))
* **oauth:** implement secure code exchange pattern ([50ce136](https://github.com/the-developer-network/tdn-api/commit/50ce136410c4e7c2a495933a337bced0d50e4064))
* **post:** add categories support and CDN URL normalization ([#77](https://github.com/the-developer-network/tdn-api/issues/77)) ([c288460](https://github.com/the-developer-network/tdn-api/commit/c288460dd5ef36b6790935508229bb7f6847f081))
* **post:** add interaction states and refactor post architecture ([fd8e066](https://github.com/the-developer-network/tdn-api/commit/fd8e066c47d7867913fb2124618b1020ce5947ef))
* **post:** implement mapped prisma schema, auto-hashtag repository and create post http layer ([0099818](https://github.com/the-developer-network/tdn-api/commit/0099818879a3ad5b3d7bae59a6dd97ffaa86ef87))
* **post:** implement multipart media upload to aws s3 with robust error handling ([b17eb65](https://github.com/the-developer-network/tdn-api/commit/b17eb65a1d19bbe258eb0431e2895eb80b4cc161))
* **post:** implement paginated feed with author relations and dynamic cdn url mapping ([255c9b5](https://github.com/the-developer-network/tdn-api/commit/255c9b5b69ad7c517a59008a2cf170100b2fa454))
* **post:** implement post deletion with aws s3 media cleanup and authorization ([7e096c9](https://github.com/the-developer-network/tdn-api/commit/7e096c98716d1c48462133263907bdf2e5d9322f))
* **post:** implement redis caching for feed and cache invalidation on mutations ([1fe31da](https://github.com/the-developer-network/tdn-api/commit/1fe31da006f3c870c8297a405082783b8b472c5d))
* **post:** implement unlike post functionality ([8fc25c9](https://github.com/the-developer-network/tdn-api/commit/8fc25c947f41a5d0d3271937501b26f3e504d2bd))
* **posts:** invalidate feed cache on like/unlike operations ([9ff56cc](https://github.com/the-developer-network/tdn-api/commit/9ff56ccc35e72f5e691bcb96a434791a59a22e6f))
* **posts:** support GET /posts?tag filter with popularity sort ([f51f740](https://github.com/the-developer-network/tdn-api/commit/f51f7407712b52939c7fb9ae9f18c82d55108e97))
* **profile:** add explicit many-to-many follow schema and integrate counts with isFollowing flag ([2351c97](https://github.com/the-developer-network/tdn-api/commit/2351c979683e75efe0fbfd03e11af54cdf49dbdd))
* **profile:** add GET /profiles/suggestions endpoint ([caa7a50](https://github.com/the-developer-network/tdn-api/commit/caa7a5088966f521895c10b34aef8ada151df1d3))
* **profile:** add isMe flag to profile discovery and implement optional auth route ([84bff40](https://github.com/the-developer-network/tdn-api/commit/84bff4082ab10fddb36c6b59d51328e6f3b2be30))
* **profile:** add paginated followers and following lists with isFollowing state ([baea6eb](https://github.com/the-developer-network/tdn-api/commit/baea6ebec470ca1d1ea3393867b7733fee9f32d7))
* **profile:** implement atomic profile update with performance optimizations ([32fca75](https://github.com/the-developer-network/tdn-api/commit/32fca75e98ca65c767e720b24388d892a8488434))
* **profile:** implement avatar management with Cloudflare R2 ([17c3b2d](https://github.com/the-developer-network/tdn-api/commit/17c3b2d00b3c9588b05a8543abfd294e03cf2eb6))
* **profile:** implement banner upload with R2 storage and cleanup logic ([7e8d0a0](https://github.com/the-developer-network/tdn-api/commit/7e8d0a0ee15776fc2aeb5203de28299baf13084d))
* **profile:** implement public profile discovery and normalize storage paths ([ef05b44](https://github.com/the-developer-network/tdn-api/commit/ef05b441ed9e7d18e822a9fd2b454096543e8f66))
* **profile:** implement user search functionality with optional auth and isMe mapping ([16b3caa](https://github.com/the-developer-network/tdn-api/commit/16b3caa712fad50ca4d26886811764a6d8a7865b))
* Randomize feed order with Fisher-Yates shuffle for cache and DB results ([#134](https://github.com/the-developer-network/tdn-api/issues/134)) ([bd809ae](https://github.com/the-developer-network/tdn-api/commit/bd809ae85d178e3788d46c636c72270ac76fd7b2))
* **realtime:** implement secure websocket architecture and event-driven notification system ([74775c1](https://github.com/the-developer-network/tdn-api/commit/74775c1e38a581a15cc4bc52513f1e0056c26911))
* register core routes and complete server entry point ([8dbf55d](https://github.com/the-developer-network/tdn-api/commit/8dbf55d9adcfb367b4f83342629556c7b0a8557e))
* **schema:** add CommentBookmark model and user relation ([4819a23](https://github.com/the-developer-network/tdn-api/commit/4819a23824d3796dc3820f1c0103c48baa9a6df9))
* **security:** implement granular rate limiting across all routes ([30f0a2b](https://github.com/the-developer-network/tdn-api/commit/30f0a2baad1c9da3595be000b8d8668d1223c814))
* simplify GetPosts output structure and standardize HTTP response format ([9f8a857](https://github.com/the-developer-network/tdn-api/commit/9f8a8570b5f93def52895005afd60172e8277ff8))
* **trends:** add GET /api/v1/trends endpoint with trending hashtags ([98e5529](https://github.com/the-developer-network/tdn-api/commit/98e55293ba11a60629b9962b10abd9468ffff95f))
* **user:** add isBot flag and restrict system/tech posts to bots ([#69](https://github.com/the-developer-network/tdn-api/issues/69)) ([24a43bf](https://github.com/the-developer-network/tdn-api/commit/24a43bfb56c35ed12d53cf224cc5eec485dd2de1))
* **user:** implement change username functionality ([f278266](https://github.com/the-developer-network/tdn-api/commit/f2782662c8e3e6ee209bbdb0a15fa0d17019488b))
* **user:** implement email change functionality ([2cae722](https://github.com/the-developer-network/tdn-api/commit/2cae722c4dbc9a5139b8adef5c99d3bc717a6c4e))
* **user:** implement get-me endpoint and oauth account repository ([ef0c73d](https://github.com/the-developer-network/tdn-api/commit/ef0c73df339f841a6ee34867b6ee21ed481bcbef))
* **user:** implement password change functionality ([a9b7987](https://github.com/the-developer-network/tdn-api/commit/a9b79873048ed357dad912888115658301607da9))
* **user:** implement type-safe profile posts feed with DTO mappers ([0aaa826](https://github.com/the-developer-network/tdn-api/commit/0aaa8266a0c4d40075abcaf851d1dbdcf4d40524))
