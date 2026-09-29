# Releasing

GitHub is what userstyles.world mirrors and what Stylus installs from the raw link.

## Release a new version

1. Edit `linkedin-tokyonight.user.css`. If LinkedIn changed its CSS, run
   `python tools/linkedin-tokyonight-gen.py` first (see the README).
2. **Raise `@version`.** This is the step that makes everything else work. Stylus ignores
   a fetched file whose version has not moved, and the userstyles.world mirror job skips
   it too. Skip it and every channel silently keeps serving the old CSS.
3. Commit and push.
4. Check that GitHub serves the new version:

   ```sh
   curl -sL "https://raw.githubusercontent.com/antenando/linkedin-tokyonight/main/linkedin-tokyonight.user.css" | grep '^@version'
   ```

5. Wait for userstyles.world. The mirror job runs at 00:04 UTC and every 4 hours after,
   in batches, so allow a few extra minutes.

Metadata mirroring is off on purpose (see below). A change to the name or the description
in the header does **not** reach the listing. Edit those on userstyles.world by hand.

## The userstyles.world listing

Stylus → *Find styles* searches userstyles.world, not GitHub, so the listing is what
makes the style findable. To create it again:

1. Sign in, open https://userstyles.world/add. Use `/add`, not `/import`: `/import`
   copies the header description, which is longer than the 160-character limit.
2. Fill in the form:

   | Field | Value |
   |---|---|
   | Name | `LinkedIn - Tokyo Night Storm` |
   | Description | the 155-character text below |
   | Homepage | `https://github.com/antenando/linkedin-tokyonight` |
   | License | `MIT` (type it; blank means No License) |
   | Category | `linkedin` |
   | Preview image | `screenshots/messaging.jpg` |
   | Source code | paste the whole `linkedin-tokyonight.user.css` |

   ```text
   Tokyo Night Storm dark theme for LinkedIn. Retints every page, messaging included, and makes the notification badge neon red. Colours adjustable in Stylus.
   ```

   To copy the source code: `clip < linkedin-tokyonight.user.css` (Windows) or
   `pbcopy < linkedin-tokyonight.user.css` (macOS).

3. After it is created, open its edit page and set:
   - **Mirror source code URL:** the raw GitHub URL above.
   - **Mirror source code updates:** on. Without it the listing is frozen at the pasted
     code.
   - **Mirror style metadata:** off. On, it would replace the short description with the
     long header one, bypassing the 160-character check.

**The category must be `linkedin`.** For a `.com` host, Stylus matches the bare name.
`linkedin.com` ranks lower, and an empty category is stored as `unset`, which inline
search never shows. The form does not warn about either.

userstyles.world removes `@updateURL` from every style by policy. Installs from the
listing update from userstyles.world, which follows GitHub through the mirror.

## Check the listing

The listing is https://userstyles.world/style/30448/linkedin-tokyo-night-storm.

```sh
ID=30448
S=https://userstyles.world
B=https://raw.githubusercontent.com/antenando/linkedin-tokyonight/main

# 1. mirroring is on (prints nothing if the mirror URL did not save)
curl -sL "$S/style/$ID" | tr '<' '\n' | grep -A2 'Mirrored from' | sed 's/[^>]*>//' | tr -d '\n'; echo

# 2. userstyles.world and GitHub serve the same version
echo "USW:    $(curl -s "$S/api/style/$ID.user.css" | sed -n 's/^@version *//p' | tr -d '\r')"
echo "GitHub: $(curl -sL "$B/linkedin-tokyonight.user.css" | sed -n 's/^@version *//p' | tr -d '\r')"

# 3. the inline-search index has it under linkedin (allow 15 minutes after creating it)
curl -s "$S/api/index/uso-format" | python -c "
import json, sys
d = json.load(sys.stdin)['data']
print([e for e in d if e.get('i') == $ID] or 'not indexed yet')"
```

The real test: on linkedin.com, open Stylus → *Find styles*. The style must appear.
