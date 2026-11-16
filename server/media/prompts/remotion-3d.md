Remotion 3D craft (fixed guidance for this 3D cut):

- Wrap all 3D content in <ThreeCanvas> with explicit width and height, and light it with at least an ambientLight and a directionalLight.
- Nothing may animate by itself: shaders, models and materials move only from values computed from useCurrentFrame(), or the render flickers. useFrame() from @react-three/fiber is forbidden.
- Rotate and move meshes from the frame, for example rotation={[0, frame * 0.02, 0]}.
- Any <Sequence> inside <ThreeCanvas> must set layout="none".
