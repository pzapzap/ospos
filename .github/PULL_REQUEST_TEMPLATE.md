<!-- Thanks for contributing to OSPOS! -->

## What this PR does

<!-- One or two sentences. What changed and why. -->

## Type of change

<!-- Delete those that don't apply -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature causing existing behavior to change)
- [ ] Refactor / code health (no functional change)
- [ ] Docs only

## How I tested this

<!-- Describe what you tested manually. If your change touches the payment flow, also note what didn't break. -->

- [ ] TypeScript compiles (`npx tsc --noEmit`)
- [ ] Tested in the iOS simulator
- [ ] (If touching the server) Tested against the mock backend
- [ ] (If touching real payments) Tested with Stripe test mode

## Screenshots

<!-- For any UI change, drop before/after screenshots here. -->

## Checklist

- [ ] My change follows the existing patterns in the codebase
- [ ] User-facing strings live in `src/constants/strings.ts`
- [ ] Money values are integer cents (no floats anywhere in the money path)
- [ ] SQL uses parameterized queries (never string interpolation)
- [ ] I haven't added a new state management library
- [ ] I haven't added an ORM to the server
- [ ] If I touched the design system, hero numbers still use DM Serif Display

## Issue references

<!-- Closes #123, or "Related to #456" -->
