import { useEffect, useState } from 'react'
import { FileJson, FolderOpen, Loader2 } from 'lucide-react'
import { BaseDialog } from './BaseDialog'
import { listScenesFromServer, loadSceneFromFile } from '@/utils/fileOperations'
import type { SceneDescription } from '@/types/scene'

interface OpenProjectDialogProps {
  isOpen: boolean
  onClose: () => void
  onLoad: (scene: SceneDescription) => void
}

export function OpenProjectDialog({ isOpen, onClose, onLoad }: OpenProjectDialogProps) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setSelected(null)
    setLoading(true)
    listScenesFromServer().then((list) => {
      setFiles(list)
      setLoading(false)
    })
  }, [isOpen])

  const handleOpen = async (filename: string) => {
    setSelected(filename)
    const scene = await loadSceneFromFile(filename)
    if (scene) {
      onLoad(scene)
      onClose()
    }
    setSelected(null)
  }

  return (
    <BaseDialog title="Открыть из проекта" isOpen={isOpen} onClose={onClose}>
      <div className="space-y-3 min-w-[360px]">
        <p className="text-sm text-cad-muted">
          Файлы из каталога <code className="bg-cad-bg px-1 rounded text-xs">scenes/</code>
        </p>

        <div className="border border-cad-border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-cad-muted text-sm">
              <Loader2 size={16} className="animate-spin" />
              Загрузка...
            </div>
          )}

          {!loading && files.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-cad-muted text-sm">
              <FolderOpen size={24} className="opacity-40" />
              <span>Нет сохранённых файлов</span>
            </div>
          )}

          {!loading && files.map((file) => (
            <button
              key={file}
              onClick={() => handleOpen(file)}
              disabled={selected === file}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-cad-hover transition-colors border-b border-cad-border last:border-0 text-left disabled:opacity-50"
            >
              {selected === file
                ? <Loader2 size={16} className="animate-spin shrink-0 text-cad-accent" />
                : <FileJson size={16} className="shrink-0 text-cad-accent" />
              }
              <span className="text-sm truncate">{file}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-cad-border rounded hover:bg-cad-hover"
          >
            Отмена
          </button>
        </div>
      </div>
    </BaseDialog>
  )
}
