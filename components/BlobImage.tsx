'use client'

import { useLayoutEffect, useState } from 'react'

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  blob: Blob
}

export default function BlobImage({ blob, alt = '', ...props }: Props) {
  const [src, setSrc] = useState<string | undefined>(undefined)

  useLayoutEffect(() => {
    const url = URL.createObjectURL(blob)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} {...props} />
}
