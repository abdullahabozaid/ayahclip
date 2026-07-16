# Extractable Components

## Existing shared components to preserve

- `SiteNav`
- `SiteFooter`
- `NewClipLink`

## Recommended extractions during implementation

- `PhoneCanvas`: wraps the real `StylePreview` canvas, sample-length switcher, replay, and full-screen controls.
- `TemplateCard`: consistent built-in/user preview card with metadata and primary/secondary actions.
- `TemplateFamilyRail`: filter/family navigation shared by desktop rail and mobile chips.
- `InspectorSection`: collapsible group with heading, summary, and accessible content region.
- `RangeField`, `ColorField`, `SwitchField`, `SelectField`: normalized editor controls with visible values and consistent focus states.
- `IconButton`: SVG-only compact action with tooltip and accessible label; replaces glyph/emoji controls.

`PhoneCanvas` and editor controls are specific to the Template Studio rather than global site chrome. Extract them into `src/components/templates/` when implementation is approved.
