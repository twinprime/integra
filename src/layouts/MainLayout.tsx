import type { ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useSystemStore } from '../store/useSystemStore';
import './MainLayout.css';

interface MainLayoutProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  bottomPanel: ReactNode;
}

export function MainLayout({ leftPanel, rightPanel, bottomPanel }: MainLayoutProps) {
  // Keeping selectedNodeId usage if we need it later for conditional rendering
  const _selectedNodeId = useSystemStore((state) => state.selectedNodeId);

  return (
    <div className="layout-container">
        <PanelGroup direction="horizontal">
            <Panel defaultSize={20} minSize={15} className="left-panel">
                <div className="panel-container">
                   <div className="panel-header">
                        System Explorer
                   </div>
                   <div className="panel-content">
                        {leftPanel}
                   </div>
                </div>
            </Panel>
            
            <PanelResizeHandle className="resize-handle-vertical" />
            
            <Panel defaultSize={80} minSize={30}>
                <PanelGroup direction="vertical">
                    <Panel defaultSize={60} minSize={20} className="right-top-panel">
                        <div className="panel-container">
                            {rightPanel}
                        </div>
                    </Panel>
                    
                    <PanelResizeHandle className="resize-handle-horizontal" />

                    <Panel defaultSize={40} minSize={20} className="right-bottom-panel">
                        <div className="panel-container">
                             <div className="panel-subheader">
                                Visualization
                             </div>
                            <div className="panel-body-shaded">
                                {bottomPanel}
                            </div>
                        </div>
                    </Panel>
                </PanelGroup>
            </Panel>
        </PanelGroup>
    </div>
  );
}
