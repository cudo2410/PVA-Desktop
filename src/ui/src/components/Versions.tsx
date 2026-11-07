import { useState } from 'react'

function Versions(): React.JSX.Element {
  const [versions] = useState({
    electron: '44.7.2',
    chrome: '134.0',
    node: '24.11.1'
  })

  return (
    <ul className="versions">
      <li className="electron-version">Electron v{versions.electron}</li>
      <li className="chrome-version">Chromium v{versions.chrome}</li>
      <li className="node-version">Node v{versions.node}</li>
    </ul>
  )
}

export default Versions
