import '@fontsource/open-sans';
import { PropsWithChildren } from 'react';
import { BrowserRouter } from 'react-router-dom';
import Mantine from './components/Mantine';
import { TauriProvider } from './tauri/TauriProvider';
import { SWRConfig } from 'swr';

export default function ({ children }: PropsWithChildren) {
  return (
    <TauriProvider>
      <Mantine>
        <BrowserRouter>
          <SWRConfig value={{ revalidateOnFocus: false }}>
            {children}
          </SWRConfig>
        </BrowserRouter>
      </Mantine>
    </TauriProvider>
  );
}
