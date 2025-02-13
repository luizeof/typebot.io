import {
  Stack,
  Heading,
  useColorMode,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button,
  HStack,
} from '@chakra-ui/react'
import { GraphNavigation } from '@typebot.io/prisma'
import React, { useEffect } from 'react'
import { AppearanceRadioGroup } from './AppearanceRadioGroup'
import { useUser } from '../hooks/useUser'
import { ChevronDownIcon } from '@/components/icons'
import { MoreInfoTooltip } from '@/components/MoreInfoTooltip'
import { useTranslate, useTolgee } from '@tolgee/react'
import { useRouter } from 'next/router'

const localeHumanReadable = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  'pt-BR': 'Português (BR)',
  ro: 'Română',
  es: 'Español',
  it: 'Italiano',
} as const

export const UserPreferencesForm = () => {
  const { getLanguage } = useTolgee()
  const router = useRouter()
  const { t } = useTranslate()
  const { colorMode } = useColorMode()
  const { user, updateUser } = useUser()

  useEffect(() => {
    if (!user?.graphNavigation)
      updateUser({ graphNavigation: GraphNavigation.TRACKPAD })
  }, [updateUser, user?.graphNavigation])

  const changeAppearance = async (value: string) => {
    updateUser({ preferredAppAppearance: value })
  }

  const updateLocale = (locale: keyof typeof localeHumanReadable) => () => {
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`
    router.replace(
      {
        pathname: router.pathname,
        query: router.query,
      },
      undefined,
      { locale }
    )
  }

  const currentLanguage = getLanguage()

  return (
    <Stack spacing={12}>
      <HStack spacing={4}>
        <Heading size="md">{t('account.preferences.language.heading')}</Heading>
        <Menu>
          <MenuButton as={Button} rightIcon={<ChevronDownIcon />}>
            {currentLanguage
              ? localeHumanReadable[
                  currentLanguage as keyof typeof localeHumanReadable
                ]
              : 'Loading...'}
          </MenuButton>
          <MenuList>
            {Object.keys(localeHumanReadable).map((locale) => (
              <MenuItem
                key={locale}
                onClick={updateLocale(
                  locale as keyof typeof localeHumanReadable
                )}
              >
                {
                  localeHumanReadable[
                    locale as keyof typeof localeHumanReadable
                  ]
                }
              </MenuItem>
            ))}
          </MenuList>
        </Menu>
        {currentLanguage !== 'en' && (
          <MoreInfoTooltip>
            {t('account.preferences.language.tooltip')}
          </MoreInfoTooltip>
        )}
      </HStack>

      <Stack spacing={6}>
        <Heading size="md">
          {t('account.preferences.appearance.heading')}
        </Heading>
        <AppearanceRadioGroup
          defaultValue={
            user?.preferredAppAppearance
              ? user.preferredAppAppearance
              : colorMode
          }
          onChange={changeAppearance}
        />
      </Stack>
    </Stack>
  )
}
