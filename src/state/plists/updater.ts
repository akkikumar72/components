import { VersionUpgrade, getVersionUpgrade, minVersionBump } from '@pangolindex/token-lists';
import { useCallback, useEffect } from 'react';
import ReactGA from 'react-ga';
import { useDispatch, useSelector } from 'react-redux';
import { DEFAULT_TOKEN_LISTS } from 'src/constants/lists';
import { useActiveWeb3React } from 'src/hooks';
import { useFetchListCallback } from 'src/hooks/useFetchListCallback';
import useInterval from 'src/hooks/useInterval';
import useIsWindowVisible from 'src/hooks/useIsWindowVisible';
import { AppDispatch, AppState } from '../index';
import { acceptListUpdate } from './actions';

export default function Updater(): null {
  const { library } = useActiveWeb3React();
  const dispatch = useDispatch<AppDispatch>();
  const lists = useSelector<AppState, AppState['plists']['byUrl']>((state) => state.plists.byUrl);

  const isWindowVisible = useIsWindowVisible();

  const fetchList = useFetchListCallback();

  const fetchAllListsCallback = useCallback(() => {
    if (!isWindowVisible) return;
    Object.keys(lists).forEach((url) =>
      fetchList(url).catch((error) => console.debug('interval list fetching error', error)),
    );
  }, [fetchList, isWindowVisible, lists]);

  // fetch all lists every 10 minutes, but only after we initialize library
  useInterval(fetchAllListsCallback, library ? 1000 * 60 * 10 : null);

  // whenever a list is not loaded and not loading, try again to load it
  useEffect(() => {
    Object.keys(lists).forEach((listUrl) => {
      const list = lists[listUrl];

      if (!list.current && !list.loadingRequestId && !list.error) {
        fetchList(listUrl).catch((error) => console.debug('list added fetching error', error));
      }
    });
  }, [dispatch, fetchList, library, lists]);

  // automatically update lists if versions are minor/patch
  useEffect(() => {
    Object.keys(lists).forEach((listUrl) => {
      const list = lists[listUrl];
      if (list.current && list.pendingUpdate) {
        const bump = getVersionUpgrade(list.current.version, list.pendingUpdate.version);
        const isDefaultList = DEFAULT_TOKEN_LISTS.includes(listUrl);
        switch (bump) {
          case VersionUpgrade.NONE:
            throw new Error('unexpected no version bump');
          case VersionUpgrade.PATCH:
          case VersionUpgrade.MINOR:
            const min = minVersionBump(list.current.tokens, list.pendingUpdate.tokens);
            // automatically update minor/patch as long as bump matches the min update
            if (bump >= min) {
              if (isDefaultList) {
                //if its pangolin hosted token list then we will autoupdate it
                // eslint-disable-next-line import/no-named-as-default-member
                ReactGA.event({
                  category: 'Lists',
                  action: 'Update List from Popup',
                  label: listUrl,
                });
                dispatch(acceptListUpdate(listUrl));
              } else {
                //show prompts for user added token list
                // dispatch(
                //   addPopup({
                //     key: listUrl,
                //     content: {
                //       listUpdate: {
                //         listUrl,
                //         oldList: list.current,
                //         newList: list.pendingUpdate,
                //         auto: true
                //       }
                //     }
                //   })
                // )
              }
            } else {
              console.error(
                `List at url ${listUrl} could not automatically update because the version bump was only PATCH/MINOR while the update had breaking changes and should have been MAJOR`,
              );
            }
            break;

          case VersionUpgrade.MAJOR:
            if (isDefaultList) {
              // if its pangolin hosted token list then we will autoupdate it
              // eslint-disable-next-line import/no-named-as-default-member
              ReactGA.event({
                category: 'Lists',
                action: 'Update List from Popup',
                label: listUrl,
              });
              dispatch(acceptListUpdate(listUrl));
            } else {
              // show prompts for user added token list
              // dispatch(
              //   addPopup({
              //     key: listUrl,
              //     content: {
              //       listUpdate: {
              //         listUrl,
              //         auto: false,
              //         oldList: list.current,
              //         newList: list.pendingUpdate
              //       }
              //     },
              //     removeAfterMs: null
              //   })
              // )
            }
        }
      }
    });
  }, [dispatch, lists]);

  return null;
}
