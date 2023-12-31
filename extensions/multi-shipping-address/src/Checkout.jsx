import { useEffect, useMemo, useState } from 'react';

import {
    reactExtension,
    useCartLines,
    useBuyerJourneyIntercept,
    useAttributes,
    useApplyAttributeChange,
    useApplyCartLinesChange,
    useApi,
    Banner,
    Text,
    Button,
    Icon,
    BlockStack,
    ScrollView,
    InlineStack,
    View,
    Modal,
    Select,
    TextField,
    InlineLayout,
    BlockLayout,
    InlineSpacer,
    Heading,
    Pressable,
    BlockSpacer,
    Form,
    Disclosure,
    List,
    ListItem
} from '@shopify/ui-extensions-react/checkout';

import countryOptions from './countryOptions';
import AddressEditModal from './AddressEditModal.jsx';
import DeliveryMethodSelection from './DeliveryMethodSelection.jsx';

export default reactExtension(
  'purchase.checkout.delivery-address.render-after',
  () => <Extension />,
);

function Extension() {

    const {ui, query, shop} = useApi();

    const cartLines = useCartLines();
    const shippableCartLines  = cartLines.filter(line => line.merchandise.requiresShipping);

    const [shippingCountries, setShippingCountries] = useState([]);
    const [additionalAddressEdit, setAdditionalAddressEdit] = useState({});
    const [addressSaving, setAddressSaving] = useState(false);
    const [addressDeleting, setAddressDeleting] = useState(false);
    const [additionalAddresses, setAdditionalAddresses] = useState([]);
    const [openDisclosures, setOpenDisclosures] =  useState([]);
    const [selectedShippingMethods, setSelectedShippingMethods] = useState({});

    const attributes = useAttributes();
    const applyAttributeChange = useApplyAttributeChange();

    const applyCartLinesChange = useApplyCartLinesChange();

    useEffect(() => {

        // applyAttributeChange({
        //     type: 'updateAttribute',
        //     key: '__additional_addresses',
        //     value: ''
        // });

        console.log("Oi");

        query(
            `query {
              shop {
                shipsToCountries
              }
            }`
        )
        .then(({data, errors}) => {
            setShippingCountries(data.shop.shipsToCountries);
        })
        .catch(console.error);

    }, []);

    useEffect(() => {

        for (let i = 0; i < attributes.length; i++) {
            if (attributes[i].key != "__additional_addresses") continue;

            if (!attributes[i].value) continue;

            try {
                const addresses = JSON.parse(attributes[i].value);

                for (let j = 0; j < addresses.length; j++) {
                    const newItems = [];
                    for (let k = 0; k < addresses[j].items.length; k++) {
                        const index = shippableCartLines.findIndex(item => item.id == addresses[j].items[k]);
                        if (index === -1) continue;
                        newItems.push(addresses[j].items[k]);
                    }
                    addresses[j].items = newItems;
                }

                setAdditionalAddresses(addresses);
            } catch(err) {
                console.error(err.message);
                break;
            }
        }

    }, [attributes]);

    useBuyerJourneyIntercept(({ canBlockProgress }) => {
        if (canBlockProgress) {
            // return {
            //     behavior: 'block',
            //     reason: "Invalid additional shipping address #1",
            //     errors: [
            //         {
            //             message: 'Shipping address in your additional shipping address is invalid',
            //         }
            //     ]
            // }
        }

        return {
            behavior: 'allow',
        };
    })

    function addressToString(address, delimiter) {

        delimiter = typeof delimiter == 'string' ? delimiter : ', ';

        const addressProps = ['address1', 'address2', 'city', 'province', 'zip', 'country'];
        const addressParts = [];

        address.firstName == typeof address.firstName == 'string' && address.firstName.trim().length > 0 ?  address.firstName : "";
        addressParts.push(`${address.firstName} ${address.lastName}`.trim());

        for (let i = 0; i < addressProps.length; i++) {
            const prop = addressProps[i];
            if (typeof address[prop] != 'string') continue;
            if (address[prop].trim().length < 1) continue;
            addressParts.push(address[prop]);
        }

        return addressParts.join(delimiter);
    }

    async function onSaveAddress(address) {

        setAddressSaving(true);

        const newAdditialAddresses = [ ...additionalAddresses ];

        const additionalAddress = { ...address };

        additionalAddress.key = addressToString(additionalAddress, '-').toLowerCase();

        let currentAddressIndex = newAdditialAddresses.findIndex(addr => addr.id == additionalAddress.id);

        let isNewAddress = currentAddressIndex === -1;

        if (isNewAddress) {
            const duplicateAddressIndex = newAdditialAddresses.findIndex(addr => addr.key == additionalAddress.key);
            if (duplicateAddressIndex !== -1) {
                newAdditialAddresses.splice(duplicateAddressIndex, 1);
            }
        }

        if (isNewAddress) {
            newAdditialAddresses.push(additionalAddress);
        } else {
            newAdditialAddresses[currentAddressIndex] = additionalAddress;
        }

        await applyAttributeChange({
            type: 'updateAttribute',
            key: '__additional_addresses',
            value: JSON.stringify(newAdditialAddresses)
        });

        if (isNewAddress) {
            ui.overlay.close('AddressCreateModal');
        } else {
            ui.overlay.close(`AddressEditModal_${additionalAddress.id}`);
        }

        setAddressSaving(false);
        setAdditionalAddresses(newAdditialAddresses);

        const nextSelectedShippingMethods = { ...selectedShippingMethods, [additionalAddress.id]: additionalAddress.shippingMethod };
        setSelectedShippingMethods(nextSelectedShippingMethods);
        applyShippingMethodLineItemProps(nextSelectedShippingMethods, newAdditialAddresses);
    };

    async function onDeleteAddress(addressId) {
        let currentAddressIndex = additionalAddresses.findIndex(addr => addr.id == addressId);

        if (currentAddressIndex == -1) {
            return;
        }

        setAddressDeleting(true);

        const newAdditionalAddresses = [ ...additionalAddresses ];
        newAdditionalAddresses.splice(currentAddressIndex, 1);

        await applyAttributeChange({
            type: 'updateAttribute',
            key: '__additional_addresses',
            value: JSON.stringify(newAdditionalAddresses)
        });

        ui.overlay.close(`AddressEditModal_${addressId}`);

        setAddressDeleting(false);
        setAdditionalAddresses(newAdditionalAddresses);


        const nextSelectedShippingMethods = { ...selectedShippingMethods };

        if (nextSelectedShippingMethods[addressId]) {
            delete nextSelectedShippingMethods[addressId];
        }

        setSelectedShippingMethods(nextSelectedShippingMethods);
        applyShippingMethodLineItemProps(nextSelectedShippingMethods, newAdditionalAddresses);
    }

    function onAddAdditionalAddressClick() {
        setAdditionalAddressEdit({
            id: `addr_${new Date().getTime()}`,
            countryCode: 'GB',
            country: 'United Kingdom',
            address1: '',
            address2: '',
            firstName: '',
            lastName: '',
            city: '',
            province: '',
            zip: '',
            items: [],
            shippingMethod: null
        })
    }

    function onDeliveryMethodChange(addressId, value) {
        const nextSelectedShippingMethods = { ...selectedShippingMethods, [addressId]: value };
        setSelectedShippingMethods(nextSelectedShippingMethods);
        applyShippingMethodLineItemProps(nextSelectedShippingMethods, additionalAddresses);
    }

    async function applyShippingMethodLineItemProps(addressShippingMethods, additionalAddresses) {

        const cartLineChanges = [];

        const addressAssignedCartLines = additionalAddresses.map(addr => addr.items).flat(1);
        let primaryAddressLineItems = shippableCartLines.filter(line => !addressAssignedCartLines.includes(line.id));

        if (addressShippingMethods.primary && primaryAddressLineItems.length > 0) {

            for (let i = 0; i < primaryAddressLineItems.length; i++) {
                cartLineChanges.push(({
                    type: 'updateCartLine',
                    id: primaryAddressLineItems[i].id,
                    attributes: [ ...primaryAddressLineItems[i].attributes,  { key: "_shipping_rate", value: `primary:${addressShippingMethods.primary}` } ]
                }));
            }

        }

        console.log(addressShippingMethods, additionalAddresses);

        for (let i = 0; i < additionalAddresses.length; i++) {

            const addr = additionalAddresses[i];

            if (!addressShippingMethods[addr.id]) continue;

            let lineItems = shippableCartLines.filter(line => addr.items.includes(line.id));

            for (let j = 0; j < lineItems.length; j++) {
                cartLineChanges.push(({
                    type: 'updateCartLine',
                    id: lineItems[j].id,
                    attributes: [ ...primaryAddressLineItems[j].attributes,  { key: "_shipping_rate", value: `${addr.id}:${addressShippingMethods[addr.id]}` } ]
                }));
            }
        }

        console.log(cartLineChanges);

        for (let i = 0; i < cartLineChanges.length; i++) {
            let result = await applyCartLinesChange(cartLineChanges[i]);
            console.log(result);
        }

    }


    const addressAssignedCartLines = additionalAddresses.map(addr => addr.items).flat(1);
    const primaryAddressLineItems = shippableCartLines.filter(line => !addressAssignedCartLines.includes(line.id));

    if (shippableCartLines.length < 2) return null;

    const additionalAddressCreateModal = (
       <AddressEditModal
            id="AddressCreateModal"
            initialAddress={additionalAddressEdit}
            onSave={onSaveAddress}
            saving={addressSaving}
            cartLines={shippableCartLines}
            otherAddresses={additionalAddresses}
            countryOptions={countryOptions.filter(opt => shippingCountries.includes(opt.value))}
            shop={shop.myshopifyDomain}
            />
    );

    return (

    <BlockStack spacing="base">

        {
             addressAssignedCartLines.length == shippableCartLines.length && (
                <Banner status="warning">
                    No items will be sent to this address
                </Banner>
             )
        }

        {
            additionalAddresses.length > 0 && primaryAddressLineItems.length > 0 && (
                <BlockLayout rows="auto"
                            inlineAlignment="start"
                            spacing="base">
                    <Disclosure onToggle={setOpenDisclosures}
                                spacing="base">
                        <Pressable toggles={`selected-items-primary`}
                                    kind="plain">

                                <InlineLayout blockAlignment={'center'} spacing="extraTight">
                                    <Text size='small'
                                        appearance='accent'>
                                        {openDisclosures.includes(`selected-items-primary`) ? 'Hide ' : 'Show ' }
                                        {primaryAddressLineItems.length} item{primaryAddressLineItems.length != 1 ? 's' : ''}
                                    </Text>

                                    <Icon source={openDisclosures.includes(`selected-items-primary`) ? 'chevronUp' : 'chevronDown'}
                                        size='extraSmall'
                                        appearance='accent' />
                                </InlineLayout>

                        </Pressable>
                        <View id={`selected-items-primary`}>
                            <List spacing="base">
                                {
                                    shippableCartLines.filter(line => !addressAssignedCartLines.includes(line.id)).map(lineItem => {
                                        return (
                                            <ListItem key={lineItem.id}>
                                                <Text size="small">{lineItem.merchandise.title}</Text>
                                            </ListItem>
                                        )
                                    })
                                }
                            </List>
                        </View>
                    </Disclosure>
                </BlockLayout>
            )
        }

        {
            primaryAddressLineItems.length > 0 && (
                <DeliveryMethodSelection
                    countryCode="GB"
                    addressId="primary"
                    onChange={(value) => onDeliveryMethodChange('primary', value)}
                    selected={selectedShippingMethods.primary ? selectedShippingMethods.primary : ""}
                    shop={shop.myshopifyDomain} />
            )
        }

        <BlockSpacer />

        <View>
            <Heading>Additional shipping addresses</Heading>
        </View>

        {
            additionalAddresses.map(addr => (
                <BlockLayout
                    rows="auto"
                    inlineAlignment="start"
                    border="base"
                    padding="base"
                    spacing="tight"
                    cornerRadius="base"
                    key={addr.id}>

                    <Pressable
                          overlay={(
                            <AddressEditModal
                            id={`AddressEditModal_${addr.id}`}
                            initialAddress={addr}
                            onSave={onSaveAddress}
                            onDelete={() => onDeleteAddress(addr.id)}
                            saving={addressSaving}
                            cartLines={shippableCartLines}
                            deleting={addressDeleting}
                            otherAddresses={additionalAddresses.filter(additional => additional.id != addr.id)}
                            countryOptions={countryOptions.filter(opt => shippingCountries.includes(opt.value))}
                            shop={shop.myshopifyDomain}
                            />
                        )}>

                        <Text>{addressToString(addr)}</Text>

                    </Pressable>

                    {
                        addr.items.length > 0 && (
                            <Disclosure onToggle={setOpenDisclosures}
                            spacing="base">
                                <Pressable toggles={`selected-items-${addr.id}`}
                                            kind="plain">

                                        <InlineLayout blockAlignment={'center'} spacing="extraTight">
                                            <Text size='small'
                                                appearance='accent'>
                                                {openDisclosures.includes(`selected-items-${addr.id}`) ? 'Hide ' : 'Show ' }
                                                {addr.items.length} item{addr.items.length != 1 ? 's' : ''}
                                            </Text>

                                            <Icon source={openDisclosures.includes(`selected-items-${addr.id}`) ? 'chevronUp' : 'chevronDown'}
                                                size='extraSmall'
                                                appearance='accent' />
                                        </InlineLayout>

                                </Pressable>
                                <View id={`selected-items-${addr.id}`}>
                                    <List spacing="base">
                                        {
                                            addr.items.map(itemId => {

                                                const lineItem = shippableCartLines.find(line => line.id == itemId);

                                                if (!lineItem) return null;

                                                return (
                                                    <ListItem key={itemId}>
                                                        <Text size="small">{lineItem.merchandise.title}</Text>
                                                    </ListItem>
                                                )
                                            })
                                        }
                                    </List>
                                </View>
                            </Disclosure>
                        )
                    }




                </BlockLayout>
            ))
        }

        {
            addressAssignedCartLines.length < shippableCartLines.length ? (
                <Button kind="secondary"
                onPress={onAddAdditionalAddressClick}
                overlay={additionalAddressCreateModal}>
                    <InlineStack blockAlignment="center">
                        <Icon source="plus" />
                        <Text>Add shipping address</Text>
                    </InlineStack>
                </Button>
            ) : (
                <Banner>
                    <Text>All order items have been assigned to an additional address</Text>
                </Banner>
            )
        }


    </BlockStack>

    );
}
