# Quran caption font research

AyahClip must preserve Quranic marks while giving creators enough typographic range for short-form video. Font controls therefore expose only weights that ship as real faces; canvas preview and export normalize unsupported requests back to Regular rather than asking the browser to synthesize bold.

## Shipped modes

| Mode | Intended use | Exposed weights |
|---|---|---|
| Mushaf QCF | Page-faithful Quran.com glyph rendering | 400 |
| Uthmanic Hafs | Compact flowing Uthmani captions | 400 |
| Amiri Quran | Open, literary Quran captions | 400 |
| Scheherazade New | Traditional Naskh captions that need stronger social-video hierarchy | 400, 500, 600, 700 |
| Noto Naskh Arabic | Compact, screen-oriented Naskh for dense bold social captions | 400, 500, 600, 700 |

## Evidence

- Google Fonts metadata lists Amiri Quran as a single 400 face: <https://raw.githubusercontent.com/google/fonts/main/ofl/amiriquran/METADATA.pb>
- Google Fonts metadata lists Scheherazade New at 400, 500, 600, and 700: <https://raw.githubusercontent.com/google/fonts/main/ofl/scheherazadenew/METADATA.pb>
- SIL describes Scheherazade New as a Unicode Arabic typeface with broad Arabic-script support: <https://software.sil.org/ta/scheherazade/>
- The current Next.js font manifest exposes Noto Naskh Arabic as a variable family with real 400, 500, 600, and 700 weights. The source family is maintained under the SIL Open Font License by Noto Fonts: <https://github.com/notofonts/arabic>

## Rendering rule

The selected family and supported weight must be loaded before a canvas paints Arabic. Preview and export use the same font resolver. QCF word glyphs are used only when the creator explicitly selects the Mushaf QCF mode; they must not silently override another selected face. Every font picker sample includes harakat, a Quran pause mark, and an ayah end mark so creators judge the marks, not only the letterforms.
