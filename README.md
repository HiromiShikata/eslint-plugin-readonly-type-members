# template-typescript

[![CircleCI](https://dl.circleci.com/status-badge/img/gh/HiromiShikata/template-typescript/tree/main.svg?style=svg)](https://dl.circleci.com/status-badge/redirect/gh/HiromiShikata/template-typescript/tree/main)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
[![semantic-release: angular](https://img.shields.io/badge/semantic--release-angular-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

## How to use this template

1. Replace template-typescript to repository name

   ```
   find -type f | xargs sed -i 's/template-typescript/your-repository-name/g' && git add -A && git commit -m'chore: replace template name to repository name'
   ```

1. Setup Circleci

   https://app.circleci.com/projects/

1. Grant write permission to gh-actions

   https://github.com/HiromiShikata/template-typescript/settings/actions

1. Set secrets (optional)

   https://github.com/HiromiShikata/template-typescript/settings/secrets/actions

   - [GH_TOKEN](https://github.com/settings/tokens)
   - [NPM_TOKEN](https://www.npmjs.com/settings/hiromi/tokens)

1. Remove `How to use this template` section from README.md
