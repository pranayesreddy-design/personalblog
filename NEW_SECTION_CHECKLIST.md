# New Section Checklist

Use this checklist whenever you add a new section/page.

1. Add a section entry in `assets/js/site-config.js`:
   - `key` in lowercase kebab-case
   - `title`
   - `description`
   - `page` as `./sections/<key>.html`

2. Create `sections/<key>.html`:
   - copy from an existing section page
   - set `<title>` to `<Title> | Krishna Pranay`
   - set `<body data-section="<key>">`

3. Create `content/sections/<key>.json`:
   - start with:
   ```json
   {
     "posts": []
   }
   ```

4. Create folders:
   - `content/posts/<key>/`
   - `assets/images/posts/<key>/`

5. Add the first post:
   - copy `NEW_POST_TEMPLATE.json`
   - save it as `content/posts/<key>/<slug>.json`
   - add matching metadata entry in `content/sections/<key>.json`

6. Preview:
   - run `python3 -m http.server 8080`
   - open [http://localhost:8080](http://localhost:8080)
   - verify card click and post rendering
