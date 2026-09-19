import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24">
      <h1 className="text-3xl font-bold">Not found</h1>
      <p className="mt-2 text-muted">
        That page, shop or booking does not exist.
      </p>
      <Link href="/" className="mt-6 inline-block font-medium underline underline-offset-4">
        Back to the start
      </Link>
    </div>
  )
}
