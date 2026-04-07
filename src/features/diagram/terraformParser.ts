/**
 * Minimal client-side HCL extractor for MVP Terraform `resource` blocks.
 * No Node/fs — safe for Vite/browser.
 */

export type ParsedTfResource = {
  blockType: 'resource'
  terraformType: string
  name: string
  /** Raw inner body of the resource block (for multiline lists like db subnet groups). */
  resourceInner: string
  attributes: Record<string, string>
  /** Parsed `vpc_config { }` for `aws_lambda_function` (subnet_ids / security_group_ids lists). */
  vpcConfigAttrs?: Record<string, string>
}

export type ParsedProviderBlock = {
  blockType: 'provider'
  providerName: string
  /** Second label in `provider "aws" "alias"`; null if omitted. */
  alias: string | null
  resourceInner: string
  attributes: Record<string, string>
}

/** Remove # and // line comments; strip simple block comments (non-nested). */
export function stripTerraformComments(source: string): string {
  const lines = source.split(/\r?\n/)
  const out: string[] = []
  let inBlockComment = false
  for (const line of lines) {
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false
      continue
    }
    if (line.includes('/*')) {
      inBlockComment = !line.includes('*/')
      if (!inBlockComment) continue
      continue
    }
    const hash = line.indexOf('#')
    const slash = line.indexOf('//')
    let cut = -1
    if (hash >= 0) cut = hash
    if (slash >= 0 && (cut < 0 || slash < cut)) cut = slash
    out.push(cut >= 0 ? line.slice(0, cut) : line)
  }
  return out.join('\n')
}

export function extractBalancedBlock(
  source: string,
  openBraceIndex: number,
): { inner: string; end: number } {
  let depth = 0
  for (let i = openBraceIndex; i < source.length; i++) {
    const c = source[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        return { inner: source.slice(openBraceIndex + 1, i), end: i }
      }
    }
  }
  throw new Error('Unbalanced braces in Terraform source')
}

function unquoteValue(raw: string): string {
  let v = raw.trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1)
  }
  return v.replace(/\\"/g, '"').replace(/\\n/g, '\n')
}

/**
 * Top-level `key = value` assignments only; ignores nested blocks (ingress, tags, vpc_config, etc.).
 */
export function parseTopLevelAttributes(body: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const lines = body.split(/\r?\n/)
  let depth = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const opens = (trimmed.match(/\{/g) ?? []).length
    const closes = (trimmed.match(/\}/g) ?? []).length

    if (depth === 0 && opens === 0 && closes === 0) {
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      if (!/^[a-zA-Z0-9_]+$/.test(key)) continue
      const rhs = trimmed.slice(eq + 1).trim()
      attrs[key] = unquoteValue(rhs)
    }

    depth += opens - closes
  }
  return attrs
}

/**
 * Strip `provider = ...` meta lines so top-level attribute parsing and regexes
 * (e.g. S3 notification / SQS policy smart edges) work with multi-region configs.
 */
export function stripProviderAssignmentLines(hclBody: string): string {
  return hclBody
    .split(/\r?\n/)
    .filter((line) => !/^\s*provider\s*=/.test(line))
    .join('\n')
}

/** First occurrence of `blockLabel { ... }` in a resource body; returns inner HCL. */
export function extractFirstChildBlockInner(
  parentBody: string,
  blockLabel: string,
): string | null {
  const re = new RegExp(`\\b${blockLabel}\\s*\\{`)
  const m = re.exec(parentBody)
  if (!m) return null
  const openIdx = parentBody.indexOf('{', m.index)
  if (openIdx < 0) return null
  try {
    return extractBalancedBlock(parentBody, openIdx).inner
  } catch {
    return null
  }
}

/** Every `blockLabel { ... }` child block in order (e.g. multiple `queue { }` in S3 notifications). */
export function extractAllChildBlockInners(
  parentBody: string,
  blockLabel: string,
): string[] {
  const re = new RegExp(`\\b${blockLabel}\\s*\\{`, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(parentBody)) !== null) {
    const openIdx = parentBody.indexOf('{', m.index)
    if (openIdx < 0) continue
    try {
      out.push(extractBalancedBlock(parentBody, openIdx).inner)
    } catch {
      // skip malformed
    }
  }
  return out
}

/** Multiline-safe `key = [ ... ]` for Terraform lists (MVP). */
export function extractBracketListFromBody(body: string, key: string): string | null {
  const re = new RegExp(`\\b${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm')
  const m = body.match(re)
  if (!m) return null
  return `[${m[1]}]`
}

/** Attributes inside `vpc_config { }` (subnet_ids, security_group_ids). */
export function parseVpcConfigBlock(resourceInner: string): Record<string, string> {
  const inner = extractFirstChildBlockInner(resourceInner, 'vpc_config')
  if (!inner) return {}
  const attrs: Record<string, string> = {}
  const subnets = extractBracketListFromBody(inner, 'subnet_ids')
  if (subnets) attrs.subnet_ids = subnets
  const sgs = extractBracketListFromBody(inner, 'security_group_ids')
  if (sgs) attrs.security_group_ids = sgs
  return attrs
}

const RESOURCE_HEADER_RE = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/g
const PROVIDER_HEADER_RE = /provider\s+"([^"]+)"(?:\s+"([^"]+)")?\s*\{/g

export function parseTerraformProviders(source: string): ParsedProviderBlock[] {
  const cleaned = stripTerraformComments(source)
  const results: ParsedProviderBlock[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(PROVIDER_HEADER_RE.source, 'g')
  while ((m = re.exec(cleaned)) !== null) {
    const providerName = m[1]
    const alias = m[2] ?? null
    const braceIdx = cleaned.indexOf('{', m.index)
    if (braceIdx < 0) continue
    try {
      const { inner } = extractBalancedBlock(cleaned, braceIdx)
      const attributes = parseTopLevelAttributes(inner)
      results.push({
        blockType: 'provider',
        providerName,
        alias,
        resourceInner: inner,
        attributes,
      })
    } catch {
      // skip malformed block
    }
  }
  return results
}

export function parseTerraformResources(source: string): ParsedTfResource[] {
  const cleaned = stripTerraformComments(source)
  const results: ParsedTfResource[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(RESOURCE_HEADER_RE.source, 'g')
  while ((m = re.exec(cleaned)) !== null) {
    const terraformType = m[1]
    const name = m[2]
    const braceIdx = cleaned.indexOf('{', m.index)
    if (braceIdx < 0) continue
    try {
      const { inner, end } = extractBalancedBlock(cleaned, braceIdx)
      void end
      const attributes = parseTopLevelAttributes(inner)
      let vpcConfigAttrs: Record<string, string> | undefined
      if (terraformType === 'aws_lambda_function' || terraformType === 'aws_eks_cluster') {
        const vpcParsed = parseVpcConfigBlock(inner)
        if (Object.keys(vpcParsed).length > 0) {
          vpcConfigAttrs = vpcParsed
        }
      }
      results.push({
        blockType: 'resource',
        terraformType,
        name,
        resourceInner: inner,
        attributes,
        ...(vpcConfigAttrs ? { vpcConfigAttrs } : {}),
      })
    } catch {
      // skip malformed block
    }
  }
  return results
}

/** Parse `aws_vpc.main.id` style reference (field optional). */
export function parseTerraformResourceRef(
  value: string,
): { terraformType: string; name: string; field?: string } | null {
  const v = value.trim()
  const m = v.match(/^([\w.]+)\.([\w-]+)\.(\w+)$/)
  if (m) {
    const prefix = m[1]
    if (!prefix.startsWith('aws_')) return null
    return { terraformType: prefix, name: m[2], field: m[3] }
  }
  const m2 = v.match(/^([\w.]+)\.([\w-]+)$/)
  if (m2) {
    const prefix = m2[1]
    if (!prefix.startsWith('aws_')) return null
    return { terraformType: prefix, name: m2[2] }
  }
  return null
}

export function resourceAddress(terraformType: string, name: string): string {
  return `${terraformType}.${name}`
}
