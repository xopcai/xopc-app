import { StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { useTheme } from '../theme';

type ListSelectionCheckboxProps = {
  selected: boolean;
  size?: number;
};

export function ListSelectionCheckbox({ selected, size = 36 }: ListSelectionCheckboxProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.checkbox,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: selected ? colors.accent.primary : 'rgba(120,120,128,0.36)',
          backgroundColor: selected ? colors.accent.primary : 'transparent',
        },
      ]}
    >
      {selected ? <Icon source="check" size={14} color={colors.text.inverse} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
