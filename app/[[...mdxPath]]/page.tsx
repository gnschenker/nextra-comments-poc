import { Comments } from '@/components/comments/Comments'
import { notFound } from 'next/navigation'
import { generateStaticParamsFor, importPage } from 'nextra/pages'
import { useMDXComponents as getMDXComponents } from '../../mdx-components'

export const generateStaticParams = generateStaticParamsFor('mdxPath')
export const dynamicParams = false

type PageProps = { params: Promise<{ mdxPath?: string[] }> }

function pathKey(mdxPath?: string[]) {
  return (mdxPath ?? []).filter(Boolean).join('/')
}

async function loadPage(mdxPath?: string[]) {
  const pages = await generateStaticParams()
  const wanted = pathKey(mdxPath)
  const known = pages.some((page) => {
    const value = page.mdxPath
    const segs = Array.isArray(value) ? value : value ? [String(value)] : []
    return pathKey(segs) === wanted
  })
  if (!known) notFound()
  return importPage(mdxPath)
}

export async function generateMetadata(props: PageProps) {
  const params = await props.params
  const { metadata } = await loadPage(params.mdxPath)
  return metadata
}

const Wrapper = getMDXComponents().wrapper

export default async function Page(props: PageProps) {
  const params = await props.params
  const { default: MDXContent, toc, metadata, sourceCode } = await loadPage(params.mdxPath)
  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <div data-comments-content>
        <MDXContent {...props} params={params} />
      </div>
      <Comments />
    </Wrapper>
  )
}
