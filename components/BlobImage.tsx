'use client'

import { useLayoutEffect, useRef } from 'react'

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  blob: Blob
}

export default function BlobImage({ blob, alt = '', ...props }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null)

  useLayoutEffect(() => {
    const url = URL.createObjectURL(blob)
    if (imgRef.current) imgRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [blob])

  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={imgRef} alt={alt} {...props} />
}
