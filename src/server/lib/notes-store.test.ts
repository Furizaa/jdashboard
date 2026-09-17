import { describe, expect, it } from 'vitest'
import {
  listNoteKeys,
  noteFilePath,
  notesDir,
  readNote,
  writeNote,
  type NotesStoreDeps,
} from './notes-store'

function fakeStore(seed?: Record<string, string>) {
  const homeDir = '/home/me'
  const files = new Map<string, string>(Object.entries(seed ?? {}))
  const dirs = new Set<string>()
  const deps: NotesStoreDeps = {
    homeDir,
    readFile: (p) => {
      const v = files.get(p)
      return v === undefined ? Promise.reject(new Error('ENOENT')) : Promise.resolve(v)
    },
    writeFile: (p, data) => {
      files.set(p, data)
      return Promise.resolve()
    },
    mkdir: (p) => {
      dirs.add(p)
      return Promise.resolve()
    },
    deleteFile: (p) => {
      if (!files.has(p)) return Promise.reject(new Error('ENOENT'))
      files.delete(p)
      return Promise.resolve()
    },
    readDir: (p) => {
      const prefix = p.endsWith('/') ? p : `${p}/`
      const names = [...files.keys()]
        .filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes('/'))
        .map((f) => f.slice(prefix.length))
      return Promise.resolve(names)
    },
  }
  return { deps, files, dirs, homeDir }
}

describe('noteFilePath', () => {
  it('is one .md file per issue key under the notes dir', () => {
    expect(noteFilePath('/home/me', 'HDR-42')).toBe('/home/me/.clashboard/notes/HDR-42.md')
  })

  it('rejects an invalid issue key rather than shaping a path from it', () => {
    expect(() => noteFilePath('/home/me', '../secrets')).toThrow(/invalid issue key/u)
  })
})

describe('readNote', () => {
  it('returns the empty note when no file exists', async () => {
    const { deps } = fakeStore()
    expect(await readNote('HDR-1', deps)).toBe('')
  })

  it('returns the stored markdown verbatim', async () => {
    const { deps, homeDir } = fakeStore({
      [noteFilePath('/home/me', 'HDR-1')]: '# Heading\n\n- a\n- b\n',
    })
    expect(homeDir).toBe('/home/me')
    expect(await readNote('HDR-1', deps)).toBe('# Heading\n\n- a\n- b\n')
  })

  it('rejects an invalid issue key', async () => {
    const { deps } = fakeStore()
    await expect(readNote('nope', deps)).rejects.toThrow(/invalid issue key/u)
  })
})

describe('writeNote', () => {
  it('writes the markdown and creates the notes directory', async () => {
    const { deps, files, dirs, homeDir } = fakeStore()
    await writeNote('HDR-1', 'some **markdown**', deps)
    expect(dirs.has(notesDir(homeDir))).toBe(true)
    expect(files.get(noteFilePath(homeDir, 'HDR-1'))).toBe('some **markdown**')
  })

  it('deletes the file when the note is blanked', async () => {
    const path = noteFilePath('/home/me', 'HDR-1')
    const { deps, files } = fakeStore({ [path]: 'old content' })
    await writeNote('HDR-1', '   \n  ', deps)
    expect(files.has(path)).toBe(false)
  })

  it('is a no-op-safe delete when blanking a note that was never written', async () => {
    const { deps, files } = fakeStore()
    await expect(writeNote('HDR-1', '', deps)).resolves.toBeUndefined()
    expect(files.has(noteFilePath('/home/me', 'HDR-1'))).toBe(false)
  })

  it('rejects an invalid issue key', async () => {
    const { deps } = fakeStore()
    await expect(writeNote('bad key', 'x', deps)).rejects.toThrow(/invalid issue key/u)
  })
})

describe('listNoteKeys', () => {
  it('returns [] when the notes directory does not exist', async () => {
    const { deps } = fakeStore()
    deps.readDir = () => Promise.reject(new Error('ENOENT'))
    expect(await listNoteKeys(deps)).toEqual([])
  })

  it('returns the issue key for every .md file, dropping the extension', async () => {
    const { deps } = fakeStore({
      [noteFilePath('/home/me', 'HDR-1')]: 'a',
      [noteFilePath('/home/me', 'HDR-2')]: 'b',
    })
    expect(await listNoteKeys(deps)).toEqual(['HDR-1', 'HDR-2'])
  })

  it('ignores non-markdown entries', async () => {
    const dir = notesDir('/home/me')
    const { deps } = fakeStore({
      [noteFilePath('/home/me', 'HDR-1')]: 'a',
      [`${dir}/README.txt`]: 'x',
      [`${dir}/.DS_Store`]: 'x',
    })
    expect(await listNoteKeys(deps)).toEqual(['HDR-1'])
  })

  it('reflects a written note and drops it once blanked', async () => {
    const { deps } = fakeStore()
    await writeNote('HDR-7', 'hello', deps)
    expect(await listNoteKeys(deps)).toEqual(['HDR-7'])
    await writeNote('HDR-7', '', deps)
    expect(await listNoteKeys(deps)).toEqual([])
  })
})
