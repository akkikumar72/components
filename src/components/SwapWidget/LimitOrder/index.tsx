/* eslint-disable max-lines */
import { useGelatoLimitOrders } from '@gelatonetwork/limit-orders-react';
import { CAVAX, JSBI, Token, TokenAmount, Trade } from '@pangolindex/sdk';
import { CurrencyAmount, Currency as UniCurrency } from '@uniswap/sdk-core';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Divide, RefreshCcw, X } from 'react-feather';
import { ThemeContext } from 'styled-components';
import { NATIVE } from 'src/constants';
import { useActiveWeb3React, useChainId } from 'src/hooks';
import { ApprovalState, useApproveCallbackFromInputCurrencyAmount } from 'src/hooks/useApproveCallback';
import { useWalletModalToggle } from 'src/state/papplication/hooks';
import { useIsSelectedAEBToken } from 'src/state/plists/hooks';
import { LimitField, LimitNewField } from 'src/state/pswap/actions';
import { useSwapActionHandlers } from 'src/state/pswap/hooks';
import { useUserSlippageTolerance } from 'src/state/puser/hooks';
import { galetoMaxAmountSpend } from 'src/utils/maxAmountSpend';
import { wrappedGelatoCurrency } from 'src/utils/wrappedCurrency';
import { Box, Button, Text, ToggleButtons } from '../../';
import ConfirmLimitOrderDrawer from '../ConfirmLimitOrderDrawer';
import LimitOrderDetailInfo from '../LimitOrderDetailInfo';
import SelectTokenDrawer from '../SelectTokenDrawer';
import TradeOption from '../TradeOption';
import { DeprecatedWarning } from '../Warning';
import { ArrowWrapper, CurrencyInputTextBox, InputText, PValue, Root, SwapWrapper } from './styled';

enum Rate {
  DIV = 'DIV',
  MUL = 'MUL',
}

interface Props {
  swapType: string;
  setSwapType: (value: string) => void;
  isLimitOrderVisible: boolean;
}

const LimitOrder: React.FC<Props> = ({ swapType, setSwapType, isLimitOrderVisible }) => {
  const [isTokenDrawerOpen, setIsTokenDrawerOpen] = useState(false);
  const [selectedPercentage, setSelectedPercentage] = useState(0);
  const [tokenDrawerType, setTokenDrawerType] = useState(LimitNewField.INPUT);
  const [activeTab, setActiveTab] = useState<'SELL' | 'BUY'>('SELL');
  const { account } = useActiveWeb3React();
  const chainId = useChainId();
  const theme = useContext(ThemeContext);

  const percentageValue = [25, 50, 75, 100];

  const {
    handlers: {
      handleInput: onUserInput,
      handleRateType,
      handleCurrencySelection: onCurrencySelection,
      handleSwitchTokens: onSwitchTokens,
      handleLimitOrderSubmission,
    },
    derivedOrderInfo: {
      parsedAmounts,
      currencies,
      currencyBalances,
      trade,
      formattedAmounts,
      inputError: swapInputError,
      rawAmounts,
      price,
    },
    orderState: { independentField, rateType },
  } = useGelatoLimitOrders();

  const { onCurrencySelection: onSwapCurrencySelection } = useSwapActionHandlers(chainId);

  // get custom setting values for user
  const [allowedSlippage] = useUserSlippageTolerance();
  const recipient = account ?? null;
  const isValid = !swapInputError;

  const gelatoInputCurrency = currencies[LimitField.INPUT] as any;
  const gelatoOutputCurrency = currencies[LimitField.OUTPUT] as any;

  const inputTokenInfo = gelatoInputCurrency?.tokenInfo;
  const outputTokenInfo = gelatoOutputCurrency?.tokenInfo;

  const inputCurrency =
    gelatoInputCurrency && gelatoInputCurrency?.symbol === CAVAX[chainId].symbol
      ? CAVAX[chainId]
      : inputTokenInfo && inputTokenInfo.symbol === CAVAX[chainId].symbol
      ? CAVAX[chainId]
      : inputTokenInfo
      ? new Token(
          inputTokenInfo?.chainId,
          inputTokenInfo?.address,
          inputTokenInfo?.decimals,
          inputTokenInfo?.symbol,
          inputTokenInfo?.name,
        )
      : gelatoInputCurrency && gelatoInputCurrency.isToken
      ? new Token(
          gelatoInputCurrency?.chainId,
          gelatoInputCurrency?.address,
          gelatoInputCurrency?.decimals,
          gelatoInputCurrency?.symbol,
          gelatoInputCurrency?.name,
        )
      : undefined;

  const outputCurrency =
    gelatoOutputCurrency && gelatoOutputCurrency?.symbol === CAVAX[chainId].symbol
      ? CAVAX[chainId]
      : outputTokenInfo && outputTokenInfo?.symbol === CAVAX[chainId].symbol
      ? CAVAX[chainId]
      : outputTokenInfo
      ? new Token(
          outputTokenInfo?.chainId,
          outputTokenInfo?.address,
          outputTokenInfo?.decimals,
          outputTokenInfo?.symbol,
          outputTokenInfo?.name,
        )
      : gelatoOutputCurrency && gelatoOutputCurrency.isToken
      ? new Token(
          gelatoOutputCurrency?.chainId,
          gelatoOutputCurrency?.address,
          gelatoOutputCurrency?.decimals,
          gelatoOutputCurrency?.symbol,
          gelatoOutputCurrency?.name,
        )
      : undefined;

  const handleActiveTab = (tab: 'SELL' | 'BUY') => {
    if (activeTab === tab) return;

    handleRateType(rateType, price);
    setActiveTab(tab);
  };

  // toggle wallet when disconnected
  const toggleWalletModal = useWalletModalToggle();

  const handleTypeInput = useCallback(
    (value: string) => {
      onUserInput(LimitNewField.INPUT as any, value);
    },
    [onUserInput],
  );

  const handleTypeOutput = useCallback(
    (value: string) => {
      onUserInput(LimitNewField.OUTPUT as any, value);
    },
    [onUserInput],
  );

  // price
  const handleTypeDesiredRate = useCallback(
    (value: string) => {
      onUserInput(LimitNewField.PRICE as any, value);
    },
    [onUserInput],
  );

  // modal and loading
  const [{ showConfirm, tradeToConfirm, swapErrorMessage, attemptingTxn, txHash }, setSwapState] = useState<{
    showConfirm: boolean;
    tradeToConfirm: Trade | undefined;
    attemptingTxn: boolean;
    swapErrorMessage: string | undefined;
    txHash: string | undefined;
  }>({
    showConfirm: false,
    tradeToConfirm: undefined,
    attemptingTxn: false,
    swapErrorMessage: undefined,
    txHash: undefined,
  });

  // const route = trade?.route
  const tradePrice = trade?.executionPrice;

  // check whether the user has approved the router on the input token
  const [approval, approveCallback] = useApproveCallbackFromInputCurrencyAmount(parsedAmounts.input);

  // check if user has gone through approval process, used to show two step buttons, reset on token change
  const [approvalSubmitted, setApprovalSubmitted] = useState<boolean>(false);

  // mark when a user has submitted an approval, reset onTokenSelection for input field
  useEffect(() => {
    if (approval === ApprovalState.PENDING) {
      setApprovalSubmitted(true);
    }
  }, [approval, approvalSubmitted]);

  const maxAmountInput: CurrencyAmount<UniCurrency> | undefined = galetoMaxAmountSpend(
    chainId,
    currencyBalances[LimitField.INPUT],
  );

  // for limit swap
  const handleSwap = useCallback(() => {
    if (!handleLimitOrderSubmission) {
      return;
    }

    setSwapState({
      attemptingTxn: true,
      tradeToConfirm,
      showConfirm,
      swapErrorMessage: undefined,
      txHash: undefined,
    });

    try {
      if (!currencies.input?.wrapped.address) {
        throw new Error('Invalid input currency');
      }

      if (!currencies.output?.wrapped.address) {
        throw new Error('Invalid output currency');
      }

      if (!rawAmounts.input) {
        throw new Error('Invalid input amount');
      }

      if (!rawAmounts.output) {
        throw new Error('Invalid output amount');
      }

      if (!account) {
        throw new Error('No account');
      }

      handleLimitOrderSubmission({
        inputToken: currencies.input?.isNative ? NATIVE : currencies.input?.wrapped.address,
        outputToken: currencies.output?.isNative ? NATIVE : currencies.output?.wrapped.address,
        inputAmount: rawAmounts.input,
        outputAmount: rawAmounts.output,
        owner: account,
      })
        .then(({ hash }) => {
          setSwapState({
            attemptingTxn: false,
            tradeToConfirm,
            showConfirm,
            swapErrorMessage: undefined,
            txHash: hash,
          });
        })
        .catch((error) => {
          setSwapState({
            attemptingTxn: false,
            tradeToConfirm,
            showConfirm,
            swapErrorMessage: error.message,
            txHash: undefined,
          });
          // we only care if the error is something _other_ than the user rejected the tx
          if (error?.code !== 4001) {
            console.error(error);
          }
        });
    } catch (error) {
      setSwapState({
        attemptingTxn: false,
        tradeToConfirm,
        showConfirm,
        swapErrorMessage: (error as any).message,
        txHash: undefined,
      });
      // we only care if the error is something _other_ than the user rejected the tx
      if ((error as any)?.code !== 4001) {
        console.error(error);
      }
    }
  }, [
    handleLimitOrderSubmission,
    tradeToConfirm,
    showConfirm,
    currencies.input,
    currencies.output,
    rawAmounts.input,
    rawAmounts.output,
    account,
  ]);

  const handleSelectTokenDrawerClose = useCallback(() => {
    setIsTokenDrawerOpen(false);
  }, [setIsTokenDrawerOpen]);

  // show approve flow when: no error on inputs, not approved or pending, or approved in current session
  // never show if price impact is above threshold in non expert mode

  const showApproveFlow =
    !swapInputError &&
    (approval === ApprovalState.NOT_APPROVED ||
      approval === ApprovalState.PENDING ||
      (approvalSubmitted && approval === ApprovalState.APPROVED));

  const handleConfirmDismiss = useCallback(() => {
    setSwapState({ showConfirm: false, tradeToConfirm, attemptingTxn, swapErrorMessage, txHash });
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onUserInput(LimitNewField.INPUT as any, '');
    }
  }, [attemptingTxn, onUserInput, swapErrorMessage, tradeToConfirm, txHash]);

  const handleAcceptChanges = useCallback(() => {
    setSwapState({ tradeToConfirm: trade as any, swapErrorMessage, txHash, attemptingTxn, showConfirm });
  }, [attemptingTxn, showConfirm, swapErrorMessage, trade, txHash]);

  const onCurrencySelect = useCallback(
    (currency) => {
      if (tokenDrawerType === (LimitNewField.INPUT as any)) {
        setApprovalSubmitted(false); // reset 2 step UI for approvals
      }

      // here need to add isToken because in Galato hook require this variable to select currency
      const newCurrency = { ...currency };
      if (currency?.symbol === CAVAX[chainId].symbol) {
        newCurrency.isNative = true;
      } else {
        newCurrency.isToken = true;
      }

      onCurrencySelection(tokenDrawerType as any, newCurrency);
      // this is to update tokens on chart on token selection
      onSwapCurrencySelection(tokenDrawerType as any, currency);
    },
    [tokenDrawerType, onCurrencySelection, onSwapCurrencySelection],
  );

  const handleApprove = useCallback(async () => {
    await approveCallback();
  }, [approveCallback]);

  const isAEBToken = useIsSelectedAEBToken();

  const renderButton = () => {
    if (!account) {
      return (
        <Button isDisabled={!account} variant="primary" onClick={toggleWalletModal}>
          Connect Wallet
        </Button>
      );
    }

    if (showApproveFlow) {
      return (
        <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
          <Box mr="10px" width="100%">
            <Button
              variant={approval === ApprovalState.APPROVED ? 'confirm' : 'primary'}
              onClick={handleApprove}
              isDisabled={approval !== ApprovalState.NOT_APPROVED || approvalSubmitted}
              loading={approval === ApprovalState.PENDING}
              loadingText="Approving"
            >
              {approvalSubmitted && approval === ApprovalState.APPROVED
                ? 'Approved'
                : 'Approve' + currencies[LimitField.INPUT]?.symbol}
            </Button>
          </Box>

          <Button
            variant="primary"
            onClick={() => {
              setSwapState({
                tradeToConfirm: trade as any,
                attemptingTxn: false,
                swapErrorMessage: undefined,
                showConfirm: true,
                txHash: undefined,
              });
            }}
            id="swap-button"
            isDisabled={!isValid || approval !== ApprovalState.APPROVED}
            //error={isValid}
          >
            Place Order
          </Button>
        </Box>
      );
    }

    return (
      <Button
        variant="primary"
        onClick={() => {
          setSwapState({
            tradeToConfirm: trade as any,
            attemptingTxn: false,
            swapErrorMessage: undefined,
            showConfirm: true,
            txHash: undefined,
          });
        }}
        id="swap-button"
        isDisabled={!isValid || !!swapInputError}
        backgroundColor={isValid ? 'primary' : undefined}
      >
        {swapInputError ? swapInputError : 'Place Order'}
      </Button>
    );
  };

  const renderPercentage = () => {
    return (
      <Box display="flex" pb="5px">
        {percentageValue.map((value, index) => (
          <PValue
            key={index}
            isActive={selectedPercentage === value}
            onClick={() => {
              setSelectedPercentage(value);

              if (maxAmountInput) {
                const multipyAmount = JSBI.multiply(maxAmountInput?.numerator, JSBI.BigInt(value)); //Currency from uniswap sdk-core not contain raw function
                const divideAmount = JSBI.divide(multipyAmount, JSBI.BigInt(100));
                const token = wrappedGelatoCurrency(maxAmountInput?.currency ?? undefined, chainId) as Token;
                const newFinalAmount = new TokenAmount(token, divideAmount);

                onUserInput(LimitNewField.INPUT as any, newFinalAmount.toExact());
              }
            }}
          >
            {value}%
          </PValue>
        ))}
      </Box>
    );
  };

  return (
    <Root>
      <TradeOption swapType={swapType} setSwapType={setSwapType} isLimitOrderVisible={isLimitOrderVisible} />

      <SwapWrapper>
        <Box textAlign="center" width="100%">
          <ToggleButtons
            options={['SELL', 'BUY']}
            value={activeTab}
            onChange={(value) => {
              handleActiveTab(value);
            }}
          />
        </Box>

        <Box p={10}>
          {isAEBToken && <DeprecatedWarning />}

          <CurrencyInputTextBox
            label={independentField === (LimitNewField.OUTPUT as any) && trade ? 'From (estimated)' : 'From'}
            value={formattedAmounts[LimitField.INPUT]}
            onChange={(value: any) => {
              setSelectedPercentage(0);
              handleTypeInput(value as any);
            }}
            onTokenClick={() => {
              setTokenDrawerType(LimitNewField.INPUT as any);
              setIsTokenDrawerOpen(true);
            }}
            currency={inputCurrency}
            fontSize={24}
            isNumeric={true}
            placeholder="0.00"
            id="swap-currency-input"
            addonLabel={renderPercentage()}
          />

          <Box width="100%" textAlign="center" alignItems="center" display="flex" justifyContent={'center'} mt={10}>
            <ArrowWrapper>
              {rateType === Rate.MUL ? (
                <X size="16" color={currencies.input && currencies.output ? theme.text1 : theme.text4} />
              ) : (
                <Divide size="16" color={currencies.input && currencies.output ? theme.text1 : theme.text4} />
              )}
            </ArrowWrapper>
          </Box>

          <Box>
            <InputText
              value={formattedAmounts[LimitField.PRICE]}
              onChange={(value: any) => handleTypeDesiredRate(value as any)}
              fontSize={24}
              isNumeric={true}
              placeholder="0.00"
              label="Price"
            />
          </Box>
          <Box width="100%" textAlign="center" alignItems="center" display="flex" justifyContent={'center'} mt={10}>
            <ArrowWrapper
              onClick={() => {
                setApprovalSubmitted(false); // reset 2 step UI for approvals
                onSwitchTokens();
              }}
            >
              <RefreshCcw size="16" color={theme.text4} />
            </ArrowWrapper>
          </Box>
          <CurrencyInputTextBox
            label={independentField === (LimitNewField.INPUT as any) && trade ? 'To (estimated)' : 'To'}
            value={formattedAmounts[LimitField.OUTPUT]}
            onChange={(value: any) => {
              setSelectedPercentage(0);
              handleTypeOutput(value as any);
            }}
            onTokenClick={() => {
              setTokenDrawerType(LimitNewField.OUTPUT as any);
              setIsTokenDrawerOpen(true);
            }}
            currency={outputCurrency}
            fontSize={24}
            isNumeric={true}
            placeholder="0.00"
            id="swap-currency-output"
            addonLabel={
              tradePrice && (
                <Text color="text4" fontSize={16}>
                  Price: {tradePrice?.toSignificant(6)} {tradePrice?.quoteCurrency?.symbol}
                </Text>
              )
            }
          />

          {trade && <LimitOrderDetailInfo trade={trade} />}

          <Box width="100%" mt={10}>
            {renderButton()}
          </Box>
        </Box>
      </SwapWrapper>

      {/* Token Drawer */}
      <SelectTokenDrawer
        isOpen={isTokenDrawerOpen}
        onClose={handleSelectTokenDrawerClose}
        onCurrencySelect={onCurrencySelect}
        selectedCurrency={tokenDrawerType === (LimitNewField.INPUT as any) ? inputCurrency : outputCurrency}
        otherSelectedCurrency={tokenDrawerType === (LimitNewField.INPUT as any) ? outputCurrency : inputCurrency}
      />

      {/* Confirm Swap Drawer */}
      {trade && (
        <ConfirmLimitOrderDrawer
          isOpen={showConfirm}
          trade={trade as any}
          originalTrade={tradeToConfirm}
          onAcceptChanges={handleAcceptChanges}
          attemptingTxn={attemptingTxn}
          txHash={txHash}
          recipient={recipient}
          allowedSlippage={allowedSlippage}
          onConfirm={handleSwap}
          swapErrorMessage={swapErrorMessage}
          onClose={handleConfirmDismiss}
        />
      )}
    </Root>
  );
};
export default LimitOrder;
/* eslint-enable max-lines */
