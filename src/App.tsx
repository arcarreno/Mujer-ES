import Carousel from './components/Carousel'
import BlurText from './components/BlurText'

const images = Array.from({ length: 11 }, (_, i) => ({
  src: `/images/image ${i + 1}.jpeg`,
  alt: `Image ${i + 1}`,
  href: '#',
}))

function App() {
  return (
    <div className="relative w-full h-screen bg-white overflow-hidden">
      <div className="absolute left-0 w-full text-center z-10 max-sm:top-6" style={{ top: '42px' }}>
        <div className="inline-flex items-baseline">
          <BlurText
            text="Mujer"
            animateBy="letters"
            direction="top"
            delay={150}
            stepDuration={0.4}
            className="site-title"
          />
          <BlurText
            text="-ES"
            animateBy="letters"
            direction="top"
            delay={150}
            stepDuration={0.4}
            className="site-title-italic"
          />
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <Carousel images={images} />
      </div>
    </div>
  )
}

export default App
