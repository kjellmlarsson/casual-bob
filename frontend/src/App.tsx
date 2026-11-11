import {
  Button,
  Column,
  ComposedModal,
  Content,
  Grid,
  Header,
  HeaderGlobalBar,
  HeaderMenuItem,
  HeaderName,
  HeaderNavigation,
  InlineLoading,
  InlineNotification,
  ModalBody,
  ModalHeader,
  SkipToContent,
  Theme,
  Tile,
} from '@carbon/react'
import { useEffect, useRef, useState } from 'react'
import { fetchFact } from './api'
import sequenceDiagram from './assets/call-sequence.png'

export default function App() {
  const [fact, setFact] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diagramOpen, setDiagramOpen] = useState(false)
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
    <>
      <Theme theme="g100">
        <Header aria-label="Casual Rube Goldberg Machine">
          <SkipToContent href="#main-content" />
          <HeaderName href="/" prefix="">
            Casual Rube Goldberg Machine
          </HeaderName>
          <HeaderGlobalBar>
            <HeaderNavigation className="header-link" aria-label="Diagrams">
              <HeaderMenuItem
                href="#sequence-diagram"
                onClick={(e) => {
                  e.preventDefault()
                  setDiagramOpen(true)
                }}
              >
                Sequence Diagram
              </HeaderMenuItem>
            </HeaderNavigation>
          </HeaderGlobalBar>
        </Header>
      </Theme>
      <ComposedModal
        open={diagramOpen}
        onClose={() => setDiagramOpen(false)}
        containerClassName="sequence-modal"
        aria-label="Sequence Diagram"
      >
        <ModalHeader title="Sequence Diagram" />
        <ModalBody hasScrollingContent aria-label="Call sequence diagram">
          <img className="sequence-modal__image" src={sequenceDiagram} alt="Call sequence diagram" />
        </ModalBody>
      </ComposedModal>
      <Content id="main-content">
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
      </Content>
    </>
  )
}
