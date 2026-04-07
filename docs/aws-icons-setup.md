# AWS Icons Setup (Official SVG)

This project is configured to read AWS icons from `public/aws-icons`.

## Why this approach

- Uses the official AWS Architecture Icons pack.
- Works reliably with Vite + TypeScript (no custom SVG loader needed).
- Clean runtime URLs for React components.

## 1) Download official AWS icon pack

Download the official Architecture Icons ZIP from AWS:

- https://aws.amazon.com/architecture/icons/

## 2) Extract SVG files for MVP resources

Copy selected SVG files into:

- `public/aws-icons/`

Expected filenames:

- `vpc.svg`
- `subnet.svg`
- `ec2-instance.svg`
- `s3-bucket.svg`
- `rds.svg`
- `lambda.svg`
- `api-gateway.svg`

## 3) Registry used by app

The app already has a typed registry:

- `src/features/icons/aws-icon-registry.ts`

Example usage in a React component:

```ts
import { AWS_ICON_PATHS } from '../features/icons/aws-icon-registry'

const iconSrc = AWS_ICON_PATHS.ec2
```

```tsx
<img src={iconSrc} alt="EC2" className="h-4 w-4" />
```

## Optional: SVG component imports

If you prefer `import Icon from './icon.svg?react'`, install `vite-plugin-svgr` and configure Vite.
For now, URL-based loading from `public/aws-icons` is simpler and stable.
