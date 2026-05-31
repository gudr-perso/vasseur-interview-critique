import { useStore } from './store/useStore'
import { ConfigScreen }    from './screens/ConfigScreen'
import { TemplatesScreen } from './screens/TemplatesScreen'
import { LoadingScreen }   from './screens/LoadingScreen'
import { InterviewScreen } from './screens/InterviewScreen'
import { SynthesisScreen } from './screens/SynthesisScreen'

export default function App() {
  const screen = useStore(s => s.screen)

  return (
    <div className="min-h-screen bg-paper font-sans">
      {screen === 'config'    && <ConfigScreen />}
      {screen === 'templates' && <TemplatesScreen />}
      {screen === 'loading'   && <LoadingScreen />}
      {screen === 'interview' && <InterviewScreen />}
      {screen === 'synthesis' && <SynthesisScreen />}
    </div>
  )
}
