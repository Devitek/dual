import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Fait pivoter son contenu vers `rotation` (degrés) par le CHEMIN LE PLUS
 * COURT, avec un ressort : le wrapper des icônes qui restent droites quand le
 * téléphone tourne (issue #173). La valeur animée est cumulative pour que
 * -90 -> 180 tourne de -90° et non de +270°.
 */
export function RotatingView({
  rotation,
  style,
  children,
}: {
  rotation: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}): React.ReactElement {
  const anim = useRef(new Animated.Value(rotation)).current;
  const cumulative = useRef(rotation);

  useEffect(() => {
    let delta = (rotation - cumulative.current) % 360;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    if (delta === 0) return;
    cumulative.current += delta;
    Animated.spring(anim, {
      toValue: cumulative.current,
      useNativeDriver: true,
      bounciness: 5,
      speed: 16,
    }).start();
  }, [rotation, anim]);

  const rotate = anim.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={[style, { transform: [{ rotate }] }]}>{children}</Animated.View>;
}
