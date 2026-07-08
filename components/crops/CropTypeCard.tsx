import Link from 'next/link'
import BlobImage from '@/components/BlobImage'
import type { CropType, EntryPhoto } from '@/lib/db'

const PALETTE = [
  '#4A7C4A', // leaf
  '#C4623A', // terra
  '#2D4A2D', // forest
  '#8C8279', // mushroom
  '#6B8F6B',
  '#A0522D',
  '#5F7A5F',
  '#B07050',
]

function colorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

interface Props {
  cropType: CropType
  photo: EntryPhoto | null
}

export default function CropTypeCard({ cropType, photo }: Props) {
  const bg = colorForName(cropType.name)

  return (
    <Link
      href={`/crops/detail?id=${cropType.id}`}
      className="relative rounded-2xl overflow-hidden active:opacity-80"
      style={{ aspectRatio: '4/3' }}
    >
      {photo ? (
        <BlobImage blob={photo.data} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: bg }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      <span className="absolute bottom-0 left-0 right-0 px-3 py-2.5 text-white font-semibold text-sm leading-tight">
        {cropType.name}
      </span>
    </Link>
  )
}
