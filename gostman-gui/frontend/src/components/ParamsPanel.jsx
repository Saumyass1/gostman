import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Trash2, Hash, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03
    }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 }
  }
}

// Generate unique ID for params
let paramIdCounter = 0
const generateParamId = () => `param-${Date.now()}-${paramIdCounter++}`

// Parse URL query string into params array
const parseUrlParams = (url) => {
  if (!url) return []
  try {
    const urlObj = new URL(url)
    const params = []
    urlObj.searchParams.forEach((value, key) => {
      params.push({
        id: generateParamId(),
        key,
        value,
        enabled: true
      })
    })
    return params
  } catch {
    // If URL is invalid, try to parse query string manually
    const queryString = url.split('?')[1]
    if (!queryString) return []

    // Handle fragment before parsing
    const queryStringWithoutFragment = queryString.split('#')[0]

    const params = []
    queryStringWithoutFragment.split('&').forEach(param => {
      if (!param) return

      // Handle params without = (flag params)
      const eqIndex = param.indexOf('=')
      let key, value

      if (eqIndex === -1) {
        key = param
        value = ''
      } else {
        key = param.substring(0, eqIndex)
        value = param.substring(eqIndex + 1)
      }

      if (key) {
        try {
          params.push({
            id: generateParamId(),
            key: decodeURIComponent(key),
            value: decodeURIComponent(value),
            enabled: true
          })
        } catch {
          // If decoding fails, use raw values
          params.push({
            id: generateParamId(),
            key,
            value,
            enabled: true
          })
        }
      }
    })
    return params
  }
}

// Build URL with params (only enabled params with non-empty keys)
const buildUrlWithParams = (originalUrl, params) => {
  if (!originalUrl) return ''

  try {
    const urlObj = new URL(originalUrl)

    // Clear existing params but keep fragment
    urlObj.search = ''

    // Add enabled params (only those with non-empty keys)
    params
      .filter(p => p.enabled && p.key?.trim())
      .forEach(p => {
        urlObj.searchParams.append(p.key.trim(), p.value || '')
      })

    return urlObj.toString()
  } catch {
    // If URL is invalid or incomplete, try to build manually
    try {
      const [baseWithoutQuery, ...rest] = originalUrl.split('?')
      const queryString = rest.join('?')

      // Preserve fragment
      const [baseWithoutFragment, fragment] = baseWithoutQuery.split('#')
      const fragmentPart = fragment ? `#${fragment}` : ''

      // Build query string
      const searchParams = new URLSearchParams()
      params
        .filter(p => p.enabled && p.key?.trim())
        .forEach(p => {
          searchParams.append(p.key.trim(), p.value || '')
        })

      const queryStringBuilt = searchParams.toString()
      return baseWithoutFragment + (queryStringBuilt ? `?${queryStringBuilt}` : '') + fragmentPart
    } catch {
      return originalUrl
    }
  }
}

// Convert params array to JSON object
const paramsToJson = (params) => {
  const result = {}
  params
    .filter(p => p.enabled && p.key?.trim())
    .forEach(p => {
      result[p.key.trim()] = p.value || ''
    })
  return JSON.stringify(result, null, 2)
}

// Convert JSON object to params array
const jsonToParams = (jsonStr) => {
  try {
    const obj = typeof jsonStr === 'string' ? JSON.parse(jsonStr || '{}') : jsonStr
    return Object.entries(obj).map(([key, value]) => ({
      id: generateParamId(),
      key,
      value: String(value),
      enabled: true
    }))
  } catch {
    return []
  }
}

// Deep comparison for params
const paramsAreEqual = (a, b) => {
  if (a.length !== b.length) return false
  return a.every((pa, i) => {
    const pb = b[i]
    return pa.id === pb.id &&
      pa.key === pb.key &&
      pa.value === pb.value &&
      pa.enabled === pb.enabled
  })
}

export function ParamsPanel({
  url,
  queryParams,
  onUrlChange,
  onQueryParamsChange
}) {
  // Use refs to track update sources
  const isInternalUpdate = useRef(false)
  const isExternalUpdate = useRef(false)

  // Parse params from queryParams JSON on mount/initial render
  const [params, setParams] = useState(() => {
    // Check if URL has params first, otherwise use JSON
    const urlParams = parseUrlParams(url)
    return urlParams.length > 0 ? urlParams : jsonToParams(queryParams)
  })

  // Stable callbacks to avoid stale closures
  const handleUrlChange = useCallback(onUrlChange, [onUrlChange])
  const handleQueryParamsChange = useCallback(onQueryParamsChange, [onQueryParamsChange])

  // Track the last processed URL to avoid redundant processing
  const lastProcessedUrl = useRef('')

  // Sync params when URL changes externally (not from our updates)
  useEffect(() => {
    // Skip if this is an internal update
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false
      lastProcessedUrl.current = url
      return
    }

    // Skip if URL hasn't actually changed
    if (url === lastProcessedUrl.current) return

    lastProcessedUrl.current = url
    isExternalUpdate.current = true

    const urlParams = parseUrlParams(url)

    if (urlParams.length > 0) {
      setParams(prev => {
        // Create a map of existing params by key
        const existingByKey = new Map()
        prev.forEach(p => {
          if (p.key) existingByKey.set(p.key, p)
        })

        // Merge: keep existing params with same key, add new ones from URL
        const merged = [...prev]
        urlParams.forEach(up => {
          if (!existingByKey.has(up.key)) {
            merged.push(up)
          }
        })

        return merged
      })
    }

    // Clear external flag after state update
    setTimeout(() => {
      isExternalUpdate.current = false
    }, 0)
  }, [url])

  // Sync params when queryParams JSON changes externally
  useEffect(() => {
    // Skip if this is an internal update or external URL update
    if (isInternalUpdate.current || isExternalUpdate.current) return

    const jsonParams = jsonToParams(queryParams)
    if (jsonParams.length === 0) return

    setParams(prev => {
      const existingKeys = new Set(prev.filter(p => p.key).map(p => p.key))
      const newParams = jsonParams.filter(jp => !existingKeys.has(jp.key))
      return newParams.length > 0 ? [...prev, ...newParams] : prev
    })
  }, [queryParams])

  // Update URL and queryParams when params change
  useEffect(() => {
    // Skip if this is from an external URL change
    if (isExternalUpdate.current) return

    // Build new URL with params
    const newUrl = buildUrlWithParams(url, params)

    // Update queryParams JSON
    const jsonStr = paramsToJson(params)

    // Batch updates to prevent multiple renders
    isInternalUpdate.current = true

    // Use requestAnimationFrame to batch updates
    const updateUrl = () => {
      if (newUrl !== url) {
        handleUrlChange(newUrl)
      }
    }

    const updateParams = () => {
      if (jsonStr !== queryParams) {
        handleQueryParamsChange(jsonStr)
      }
    }

    updateUrl()
    updateParams()

    // Reset flag after updates are processed
    requestAnimationFrame(() => {
      isInternalUpdate.current = false
    })
  }, [params, url, queryParams, handleUrlChange, handleQueryParamsChange])

  const addParam = useCallback(() => {
    setParams(prev => [...prev, { id: generateParamId(), key: '', value: '', enabled: true }])
  }, [])

  const removeParam = useCallback((id) => {
    setParams(prev => prev.filter(p => p.id !== id))
  }, [])

  const updateParam = useCallback((id, field, value) => {
    setParams(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }, [])

  const toggleParam = useCallback((id) => {
    setParams(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p))
  }, [])

  const toggleAll = useCallback((enabled) => {
    setParams(prev => prev.map(p => ({ ...p, enabled })))
  }, [])

  const clearAll = useCallback(() => {
    setParams([])
  }, [])

  const enabledCount = params.filter(p => p.enabled && p.key?.trim()).length
  const totalCount = params.length
  const allEnabled = totalCount > 0 && params.every(p => p.enabled)

  return (
    <motion.div
      className="flex flex-col h-full"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div
        className="relative overflow-hidden"
        variants={itemVariants}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10" />
        <div className="relative px-4 py-3 border-b border-border/50 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <Hash className="h-5 w-5 text-cyan-500" />
              </motion.div>
              <div>
                <span className="text-sm font-semibold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  Query Parameters
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    {totalCount > 0 ? `${enabledCount} of ${totalCount} active` : 'No parameters'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Instructions */}
      <motion.div
        className="px-4 py-3 bg-gradient-to-r from-cyan-500/5 to-blue-500/5 border-b border-cyan-500/10"
        variants={itemVariants}
      >
        <p className="text-xs text-muted-foreground">
          Add query parameters to your URL. Parameters from the URL are automatically loaded here.
        </p>
      </motion.div>

      {/* Key-Value List */}
      <motion.div
        className="flex-1 overflow-y-auto"
        variants={itemVariants}
      >
        <div className="p-2">
          {/* Header row */}
          <div className="grid grid-cols-[40px_1fr_1fr_40px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={allEnabled}
                onChange={(e) => toggleAll(e.target.checked)}
                className="w-4 h-4 rounded border-border/50"
              />
            </div>
            <div>Key</div>
            <div>Value</div>
            <div />
          </div>

          {/* Params list */}
          <AnimatePresence mode="popLayout">
            {params.map((param) => (
              <motion.div
                key={param.id}
                layout
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, height: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className={`grid grid-cols-[40px_1fr_1fr_40px] gap-2 p-2 rounded-lg transition-colors ${
                  !param.enabled ? 'opacity-50' : ''
                }`}
              >
                {/* Enabled checkbox */}
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={param.enabled}
                    onChange={() => toggleParam(param.id)}
                    className="w-4 h-4 rounded border-border/50"
                  />
                </div>

                {/* Key input */}
                <Input
                  placeholder="Parameter name"
                  value={param.key}
                  onChange={(e) => updateParam(param.id, 'key', e.target.value)}
                  className="h-9 text-sm bg-background/50 font-mono"
                  disabled={!param.enabled}
                  autoFocus={param.key === '' && param.enabled}
                />

                {/* Value input */}
                <Input
                  placeholder="Value"
                  value={param.value}
                  onChange={(e) => updateParam(param.id, 'value', e.target.value)}
                  className="h-9 text-sm bg-background/50 font-mono"
                  disabled={!param.enabled}
                />

                {/* Delete button */}
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeParam(param.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </motion.div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Add button */}
          <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={addParam}
              className="w-full gap-2 border-dashed"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Parameter
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        className="px-4 py-3 border-t border-border/50 bg-muted/20 flex items-center justify-between"
        variants={itemVariants}
      >
        <p className="text-xs text-muted-foreground">
          {enabledCount > 0 ? (
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              {enabledCount} parameter{enabledCount > 1 ? 's' : ''} will be sent
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
              No parameters to send
            </span>
          )}
        </p>
        {totalCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Clear All
          </Button>
        )}
      </motion.div>
    </motion.div>
  )
}
