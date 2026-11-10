import { Button, Column, Grid, InlineLoading, InlineNotification, Tile } from '@carbon/react'
import { useEffect, useRef, useState } from 'react'
import { fetchFact } from './api'

export default function App() {
  const [fact, setFact] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  async function handleClick() {
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError(null)
    try {
      setFact(await fetchFact(controller.signal))
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }

  return (
    <Grid className="cat-facts">
      <Column sm={4} md={8} lg={{ span: 8, offset: 4 }}>
        <h1 className="cat-facts__title">Cat facts</h1>
        <div className="cat-facts__actions">
          <Button onClick={handleClick} disabled={loading}>
            Get a cat fact
          </Button>
          {loading && <InlineLoading description="Fetching a cat fact…" status="active" aria-live="assertive" />}
        </div>
        {error !== null && (
          <InlineNotification
            className="cat-facts__notification"
            kind="error"
            lowContrast
            title="Could not get a cat fact"
            subtitle={error}
            onClose={() => setError(null)}
          />
        )}
        <Tile id="fact-tile">
          {fact ?? <span className="cat-facts__placeholder">Press the button to get a cat fact.</span>}
        </Tile>
      </Column>
    </Grid>
  )
}
